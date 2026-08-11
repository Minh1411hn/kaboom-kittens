import {
  CARD_BY_ID,
  HAND_SIZE,
  STATE_VERSION,
  type Card,
  type Command,
  type ComboKind,
  type GameEvent,
  type GameState,
  type InteractionKind,
  type InteractionResponse,
  type PendingAction,
  type Player,
} from '#shared/types/game'
import { registerAllCards } from './cards'
import { resolveComboInteraction, validateCombo } from './cards/cats'
import { buildDealPile, finishDeck, makeCard, MAX_PLAYERS, MIN_PLAYERS } from './deck'
import { applyEffects, checkGameOver, type Effect, type EffectEnv } from './effects'
import { eligibleNopers, resolveActionStack, windowCanCloseNow } from './nope'
import { getCardDefinition } from './registry'
import { createSeed, nextInt, shuffle } from './rng'
import { currentPlayer, logEvent, playerById, skipEliminatedCurrent } from './turn'

registerAllCards()

export interface EngineConfig {
  nopeWindowMs: number
  turnTimeoutMs: number
  interactionTimeoutMs: number
}

export const DEFAULT_CONFIG: EngineConfig = {
  nopeWindowMs: 5000,
  turnTimeoutMs: 45000,
  interactionTimeoutMs: 30000,
}

export interface ReduceResult {
  state: GameState
  /** Events appended by this command, for animation on the client. */
  events: GameEvent[]
  /** Set when the command was rejected; state is returned unchanged. */
  error?: string
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function createGame(roomId: string, seed = createSeed()): GameState {
  return {
    version: STATE_VERSION,
    roomId,
    status: 'lobby',
    seed,
    rngState: seed,
    players: [],
    drawPile: [],
    discardPile: [],
    turn: { seat: 0, direction: 1, turnsRemaining: 1 },
    actionStack: [],
    nopeWindow: null,
    interaction: null,
    peeks: {},
    limbo: [],
    turnDeadline: null,
    winnerId: null,
    eventSeq: 0,
    log: [],
  }
}

export function addPlayer(state: GameState, id: string, nickname: string): string | null {
  if (state.players.some((p) => p.id === id)) return null
  if (state.status !== 'lobby') return 'The game has already started.'
  if (state.players.length >= MAX_PLAYERS) return `This room is full (${MAX_PLAYERS} players).`
  state.players.push({
    id,
    nickname,
    seat: state.players.length,
    hand: [],
    alive: true,
    connected: true,
    disconnectedAt: null,
  })
  return null
}

export function removePlayer(state: GameState, id: string): void {
  if (state.status === 'lobby') {
    state.players = state.players.filter((p) => p.id !== id)
    state.players.forEach((p, index) => (p.seat = index))
    return
  }
  // Mid-game a leaver is eliminated rather than removed, so seats stay stable.
  const player = playerById(state, id)
  if (player?.alive) {
    player.alive = false
    player.connected = false
    state.discardPile.unshift(...player.hand.splice(0))
  }
}

export function setConnected(state: GameState, id: string, connected: boolean, now: number): void {
  const player = playerById(state, id)
  if (!player) return
  player.connected = connected
  player.disconnectedAt = connected ? null : now
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reduce(
  input: GameState,
  command: Command,
  config: EngineConfig = DEFAULT_CONFIG,
): ReduceResult {
  const state = structuredClone(input)
  const before = state.eventSeq
  // Ids are derived from state so a replay produces byte-identical output.
  let idSeq = 0
  const env: EffectEnv = {
    now: command.now,
    interactionTimeoutMs: config.interactionTimeoutMs,
    nextId: () => `i${state.eventSeq}-${(idSeq += 1)}`,
  }

  const error = dispatch(state, command, config, env)
  if (error) return { state: input, events: [], error }

  settle(state, config, env)
  return { state, events: state.log.filter((e) => e.seq > before) }
}

function dispatch(
  state: GameState,
  command: Command,
  config: EngineConfig,
  env: EffectEnv,
): string | undefined {
  switch (command.type) {
    case 'start-game':
      return startGame(state, command.now, config)

    case 'play-card':
      return playCard(state, command, config, env)

    case 'draw-card': {
      if (state.status !== 'playing') return 'The game is not running.'
      if (state.interaction) return 'Someone is still answering a prompt.'
      if (state.nopeWindow) return 'Wait for the Nope window to close.'
      const player = currentPlayer(state)
      if (!player || player.id !== command.playerId) return 'It is not your turn.'
      applyEffects(state, [{ t: 'DRAW', playerId: player.id, from: 'top' }], env)
      return undefined
    }

    case 'pass-nope': {
      if (!state.nopeWindow) return 'There is no Nope window open.'
      if (!state.nopeWindow.passed.includes(command.playerId)) {
        state.nopeWindow.passed.push(command.playerId)
      }
      if (windowCanCloseNow(state)) resolveActionStack(state, env)
      return undefined
    }

    case 'close-nope-window': {
      if (!state.nopeWindow) return undefined
      resolveActionStack(state, env)
      return undefined
    }

    case 'submit-interaction':
      return submitInteraction(state, command, env)

    case 'timeout-turn': {
      if (state.status !== 'playing' || state.interaction || state.nopeWindow) return undefined
      const player = currentPlayer(state)
      if (!player) return undefined
      logEvent(
        state,
        { type: 'card-drawn', playerId: player.id, message: `${player.nickname} ran out of time and drew a card.` },
        env.now,
      )
      applyEffects(state, [{ t: 'DRAW', playerId: player.id, from: 'top' }], env)
      return undefined
    }

    case 'timeout-interaction': {
      if (!state.interaction) return undefined
      autoAnswerInteraction(state)
      return completeInteractionIfReady(state, env)
    }

    case 'quit-game': {
      if (state.status !== 'playing') return 'The game is not running.'
      const player = playerById(state, command.playerId)
      if (!player) return 'You are not in this game.'
      if (!player.alive) return 'You have already left the game.'
      // No interaction/nopeWindow guard here, unlike draw-card — a player
      // quitting should go through even mid-prompt or mid-Nope-window.
      removePlayer(state, command.playerId)
      logEvent(
        state,
        { type: 'player-exploded', playerId: command.playerId, message: `${player.nickname} quit the game.` },
        env.now,
      )
      // settle() below re-runs both of these, but only this explicit call
      // produces the "quit the game" log line above.
      skipEliminatedCurrent(state)
      checkGameOver(state, env.now)
      return undefined
    }
  }
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

function startGame(state: GameState, now: number, config: EngineConfig): string | undefined {
  if (state.status !== 'lobby') return 'The game has already started.'
  if (state.players.length < MIN_PLAYERS) return `You need at least ${MIN_PLAYERS} players.`

  const playerCount = state.players.length
  state.rngState = state.seed
  const pile = buildDealPile(state, playerCount)

  state.players.forEach((player, index) => {
    player.seat = index
    player.alive = true
    player.hand = pile.splice(0, HAND_SIZE)
    player.hand.push(makeCard('defuse'))
  })

  state.drawPile = finishDeck(state, pile, playerCount, playerCount)
  state.discardPile = []
  state.limbo = []
  state.peeks = {}
  state.actionStack = []
  state.nopeWindow = null
  state.interaction = null
  state.winnerId = null
  state.status = 'playing'
  // Random starting seat so the room host has no built-in advantage.
  state.turn = { seat: nextInt(state, playerCount), direction: 1, turnsRemaining: 1 }
  state.turnDeadline = now + config.turnTimeoutMs

  logEvent(
    state,
    {
      type: 'game-started',
      count: playerCount,
      message: `Game on — ${playerCount} players, ${state.drawPile.length} cards in the deck.`,
    },
    now,
  )
  const first = currentPlayer(state)
  if (first) {
    logEvent(state, { type: 'turn-changed', playerId: first.id, message: `${first.nickname} goes first.` }, now)
  }
  return undefined
}

function playCard(
  state: GameState,
  command: Extract<Command, { type: 'play-card' }>,
  config: EngineConfig,
  env: EffectEnv,
): string | undefined {
  if (state.status !== 'playing') return 'The game is not running.'
  if (state.interaction) return 'Someone is still answering a prompt.'

  const player = playerById(state, command.playerId)
  if (!player) return 'You are not in this game.'
  if (!player.alive) return 'You have already exploded.'
  if (!command.uids.length) return 'Pick a card to play.'

  const cards = command.uids.map((uid) => player.hand.find((c) => c.uid === uid))
  if (cards.some((c) => !c)) return 'You do not have those cards.'
  const played = cards as Card[]
  const ids = played.map((c) => c.id)
  const leadId = ids[0]!
  const action = buildAction(state, command, played)

  if (command.combo) {
    if (state.nopeWindow) return 'Wait for the Nope window to close.'
    if (currentPlayer(state)?.id !== player.id) return 'It is not your turn.'
    const valid = validateCombo(
      command.combo,
      ids,
      state,
      player,
      command.targetPlayerId ?? null,
      command.namedCardId ?? null,
    )
    if (valid !== true) return valid
  } else {
    if (played.length !== 1) return 'Play one card, or a valid combo.'
    const definition = getCardDefinition(leadId)
    if (definition.playWindow === 'own-turn') {
      if (state.nopeWindow) return 'Wait for the Nope window to close.'
      if (currentPlayer(state)?.id !== player.id) return 'It is not your turn.'
    }
    if (definition.requiresTarget && !command.targetPlayerId) return 'Choose a target player.'

    const allowed = definition.canPlay?.({ state, player, action })
    if (allowed !== undefined && allowed !== true) return allowed
  }

  // The cards are spent now — a Noped card is still discarded.
  for (const card of played) {
    player.hand.splice(
      player.hand.findIndex((c) => c.uid === card.uid),
      1,
    )
    state.discardPile.unshift(card)
  }

  if (leadId === 'nope') {
    state.actionStack.push(action)
    logEvent(
      state,
      { type: 'card-played', playerId: player.id, cardId: 'nope', message: `${player.nickname} played NOPE!` },
      env.now,
    )
    openOrCloseWindow(state, config, env)
    return undefined
  }

  state.actionStack = [action]
  logEvent(
    state,
    command.combo
      ? {
          type: 'combo-played',
          playerId: player.id,
          targetId: command.targetPlayerId,
          cardIds: ids,
          message: comboMessage(player, command.combo, state, command.targetPlayerId),
        }
      : {
          type: 'card-played',
          playerId: player.id,
          targetId: command.targetPlayerId,
          cardId: leadId,
          message: `${player.nickname} played ${CARD_BY_ID[leadId].name}${
            command.targetPlayerId ? ` on ${playerById(state, command.targetPlayerId)?.nickname}` : ''
          }.`,
        },
    env.now,
  )
  openOrCloseWindow(state, config, env)
  return undefined
}

function buildAction(
  state: GameState,
  command: Extract<Command, { type: 'play-card' }>,
  played: Card[],
): PendingAction {
  const leadId = played[0]!.id
  return {
    id: `a${state.eventSeq}-${leadId}`,
    playerId: command.playerId,
    cardId: leadId,
    cardUids: played.map((c) => c.uid),
    combo: command.combo,
    targetPlayerId: command.targetPlayerId ?? null,
    namedCardId: command.namedCardId ?? null,
    nopeable: command.combo ? true : getCardDefinition(leadId).nopeable,
  }
}

function comboMessage(
  player: Player,
  combo: ComboKind,
  state: GameState,
  targetId?: string,
): string {
  const target = targetId ? playerById(state, targetId)?.nickname : 'someone'
  if (combo === 'pair') return `${player.nickname} played a pair of cats on ${target}.`
  if (combo === 'triple') return `${player.nickname} played three cats on ${target}.`
  return `${player.nickname} played 5 different cards to raid the discard pile.`
}

/** Open a Nope window, unless nobody could Nope — then resolve immediately. */
function openOrCloseWindow(state: GameState, config: EngineConfig, env: EffectEnv): void {
  const top = state.actionStack[state.actionStack.length - 1]
  if (!top) return
  if (!top.nopeable || eligibleNopers(state).length === 0) {
    resolveActionStack(state, env)
    return
  }
  state.nopeWindow = { deadline: env.now + config.nopeWindowMs, passed: [] }
}

function submitInteraction(
  state: GameState,
  command: Extract<Command, { type: 'submit-interaction' }>,
  env: EffectEnv,
): string | undefined {
  const interaction = state.interaction
  if (!interaction) return 'There is nothing to answer right now.'
  if (interaction.id !== command.interactionId) return 'That prompt has already been answered.'
  if (!interaction.requiredFrom.includes(command.playerId)) return 'This prompt is not for you.'
  if (interaction.responses[command.playerId]) return 'You already answered.'

  const invalid = validateResponse(state, command.playerId, command.response, interaction.kind)
  if (invalid) return invalid

  interaction.responses[command.playerId] = command.response
  return completeInteractionIfReady(state, env)
}

function validateResponse(
  state: GameState,
  playerId: string,
  response: InteractionResponse,
  kind: InteractionKind,
): string | undefined {
  const player = playerById(state, playerId)
  if (!player) return 'You are not in this game.'

  if (kind === 'simultaneous-choose-card') {
    if (response.type !== 'card') return 'Choose a card.'
    if (!player.hand.some((c) => c.uid === response.uid)) return 'You do not have that card.'
    return undefined
  }
  if (kind === 'choose-card-from-hand') {
    if (response.type !== 'card') return 'Choose a card.'
    if (!player.hand.some((c) => c.uid === response.uid)) return 'You do not have that card.'
    return undefined
  }
  if (kind === 'choose-from-discard') {
    if (response.type !== 'card') return 'Choose a card.'
    if (!state.discardPile.some((c) => c.uid === response.uid)) return 'That card is not in the discard pile.'
    return undefined
  }
  if (kind === 'choose-deck-position') {
    if (response.type !== 'position') return 'Choose a position.'
    if (response.index < 0 || response.index > state.drawPile.length) return 'That position is out of range.'
    return undefined
  }
  if (kind === 'reorder-cards') {
    if (response.type !== 'order') return 'Send an order.'
    const expected = new Set((state.interaction?.cards ?? []).map((c) => c.uid))
    const got = new Set(response.uids)
    // Must be a permutation: same size, no duplicates, no invented uids.
    if (
      response.uids.length !== expected.size ||
      got.size !== expected.size ||
      response.uids.some((uid) => !expected.has(uid))
    ) {
      return 'That is not a valid ordering.'
    }
    return undefined
  }
  return undefined
}

/** Fills in defaults for anyone who did not answer before the deadline. */
function autoAnswerInteraction(state: GameState): void {
  const interaction = state.interaction
  if (!interaction) return
  for (const playerId of interaction.requiredFrom) {
    if (interaction.responses[playerId]) continue
    const player = playerById(state, playerId)
    switch (interaction.kind) {
      case 'choose-card-from-hand':
      case 'simultaneous-choose-card': {
        const card = player?.hand[0]
        if (card) interaction.responses[playerId] = { type: 'card', uid: card.uid }
        break
      }
      case 'choose-from-discard': {
        const card = state.discardPile[0]
        if (card) interaction.responses[playerId] = { type: 'card', uid: card.uid }
        break
      }
      case 'choose-deck-position':
        // Nothing chosen means the kitten goes back on top — the honest default.
        interaction.responses[playerId] = { type: 'position', index: 0 }
        break
      case 'reorder-cards':
        interaction.responses[playerId] = {
          type: 'order',
          uids: (interaction.cards ?? []).map((c) => c.uid),
        }
        break
    }
  }
}

function completeInteractionIfReady(state: GameState, env: EffectEnv): string | undefined {
  const interaction = state.interaction
  if (!interaction) return undefined

  const stillWaiting = interaction.requiredFrom.filter((id) => {
    if (interaction.responses[id]) return false
    // A player who exploded or has no cards can no longer answer.
    const player = playerById(state, id)
    return Boolean(player?.alive)
  })
  if (stillWaiting.length) return undefined

  state.interaction = null
  const effects: Effect[] = interaction.context.combo
    ? resolveComboInteraction({ state, interaction, now: env.now })
    : (getCardDefinition(interaction.cardId).onInteractionComplete?.({
        state,
        interaction,
        now: env.now,
      }) ?? [])

  applyEffects(state, effects, env)
  return undefined
}

// ---------------------------------------------------------------------------
// Post-command housekeeping
// ---------------------------------------------------------------------------

function settle(state: GameState, config: EngineConfig, env: EffectEnv): void {
  if (state.status !== 'playing') {
    state.turnDeadline = null
    return
  }

  checkGameOver(state, env.now)
  if (state.status !== 'playing') return

  // The current player may have exploded during this command.
  skipEliminatedCurrent(state)

  // Running out of cards to draw cannot happen (kittens keep the deck stocked),
  // but guard anyway so a malformed state cannot wedge the room.
  if (!state.drawPile.length && !state.interaction && !state.nopeWindow) {
    state.drawPile = shuffle(state, state.discardPile.splice(0))
  }

  // Prompts and Nope windows carry their own deadlines; the turn clock pauses.
  state.turnDeadline = state.interaction || state.nopeWindow ? null : env.now + config.turnTimeoutMs
}

/** Next deadline the room scheduler should arm a timer for, if any. */
export function nextDeadline(state: GameState): { at: number; command: Command['type'] } | null {
  if (state.status !== 'playing') return null
  if (state.nopeWindow) return { at: state.nopeWindow.deadline, command: 'close-nope-window' }
  if (state.interaction) return { at: state.interaction.deadline, command: 'timeout-interaction' }
  if (state.turnDeadline) return { at: state.turnDeadline, command: 'timeout-turn' }
  return null
}
