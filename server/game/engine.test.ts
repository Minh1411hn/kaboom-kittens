import { describe, expect, it } from 'vitest'
import {
  ALL_CARD_IDS,
  DECK_COUNT_MAX,
  HAND_SIZE,
  type Card,
  type CardId,
  type Command,
  type GameState,
} from '#shared/types/game'
import type { Rejection } from '#shared/types/errors'
import { addPlayer, createGame, DEFAULT_CONFIG, reduce, removePlayer, resetToLobby } from './engine'
import { cardCount, deckComposition, explodingKittenCount, makeCard } from './deck'
import { projectStateFor } from './projection'
import { currentPlayer, playerById } from './turn'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let clock = 1_000_000

function newGame(playerCount: number, seed = 42): GameState {
  const state = createGame('test-room', seed)
  for (let i = 0; i < playerCount; i++) addPlayer(state, `p${i}`, `Player ${i}`, 'art_02')
  return state
}

function started(playerCount: number, seed = 42): GameState {
  const state = newGame(playerCount, seed)
  const result = reduce(state, { type: 'start-game', playerId: 'p0', now: clock++ })
  expect(result.error).toBeUndefined()
  return result.state
}

function run(state: GameState, command: Omit<Command, 'now'> & { now?: number }): GameState {
  const result = reduce(state, { ...command, now: command.now ?? clock++ } as Command)
  if (result.error) throw new Error(`command rejected: ${result.error}`)
  return result.state
}

function expectRejected(state: GameState, command: Omit<Command, 'now'> & { now?: number }): Rejection {
  const result = reduce(state, { ...command, now: command.now ?? clock++ } as Command)
  expect(result.error).toBeDefined()
  return result.error!
}

/** Replaces a player's hand outright so a test can set up an exact scenario. */
function setHand(state: GameState, playerId: string, ids: CardId[]): Card[] {
  const player = playerById(state, playerId)!
  player.hand = ids.map((id) => makeCard(id))
  return player.hand
}

/** Forces whose turn it is without going through the deck. */
function setTurn(state: GameState, playerId: string, turnsRemaining = 1): void {
  state.turn.seat = playerById(state, playerId)!.seat
  state.turn.turnsRemaining = turnsRemaining
}

/** Strips every Nope so plays resolve immediately instead of opening a window. */
function removeAllNopes(state: GameState): void {
  for (const player of state.players) player.hand = player.hand.filter((c) => c.id !== 'nope')
}

function stackDraw(state: GameState, ids: CardId[]): void {
  state.drawPile = [...ids.map((id) => makeCard(id)), ...state.drawPile]
}

/**
 * Every card uid in a payload, collected structurally rather than by searching
 * the JSON text — a short uid can appear inside an unrelated key and make a
 * substring-based leak check pass or fail for the wrong reason.
 */
function uidsIn(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) uidsIn(item, found)
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'uid' && typeof item === 'string') found.add(item)
      else uidsIn(item, found)
    }
  }
  return found
}

const uidsOf = (state: GameState, playerId: string, ids: CardId[]): string[] => {
  const hand = [...playerById(state, playerId)!.hand]
  return ids.map((id) => {
    const index = hand.findIndex((c) => c.id === id)
    if (index === -1) throw new Error(`${playerId} has no ${id}`)
    return hand.splice(index, 1)[0]!.uid
  })
}

// ---------------------------------------------------------------------------

describe('deck composition', () => {
  it('has exactly one fewer Exploding Kitten than players, at every size', () => {
    for (let players = 2; players <= 10; players++) {
      expect(explodingKittenCount(players)).toBe(players - 1)
      expect(deckComposition(players)['exploding-kitten']).toBe(players - 1)
    }
  })

  it('always leaves at least one spare Defuse in the deck after dealing', () => {
    for (let players = 2; players <= 10; players++) {
      expect(cardCount('defuse', players)).toBeGreaterThan(players)
    }
  })

  it('scales every other card with the player count and never drops to zero', () => {
    for (let players = 2; players <= 10; players++) {
      for (const id of ALL_CARD_IDS) {
        expect(cardCount(id, players)).toBeGreaterThanOrEqual(1)
      }
      expect(cardCount('nope', 10)).toBeGreaterThan(cardCount('nope', 2))
    }
  })

  it('deals a full opening hand plus one Defuse to everyone', () => {
    const state = started(10)
    for (const player of state.players) {
      expect(player.hand).toHaveLength(HAND_SIZE + 1)
      expect(player.hand.filter((c) => c.id === 'defuse')).toHaveLength(1)
      expect(player.hand.some((c) => c.id === 'exploding-kitten')).toBe(false)
    }
    expect(state.drawPile.filter((c) => c.id === 'exploding-kitten')).toHaveLength(9)
  })
})

describe('deck overrides', () => {
  /** Every card in the game, wherever it currently sits. */
  function allCards(state: GameState): Card[] {
    return [
      ...state.drawPile,
      ...state.discardPile,
      ...state.limbo,
      ...state.players.flatMap((p) => p.hand),
    ]
  }

  it('leaves the scaling formulas untouched when nothing is overridden', () => {
    for (let players = 2; players <= 10; players++) {
      for (const id of ALL_CARD_IDS) {
        expect(cardCount(id, players, {})).toBe(cardCount(id, players))
      }
    }
  })

  it('uses a pinned count verbatim, at any player count', () => {
    expect(cardCount('exploding-kitten', 5, { 'exploding-kitten': 0 })).toBe(0)
    expect(cardCount('nope', 2, { nope: 17 })).toBe(17)
    expect(cardCount('nope', 10, { nope: 17 })).toBe(17)
    // A card left out of the map still scales.
    expect(deckComposition(10, { nope: 17 }).skip).toBe(cardCount('skip', 10))
  })

  it('builds the game from the pinned counts', () => {
    let state = newGame(4)
    state = run(state, { type: 'set-deck-overrides', playerId: 'p0', overrides: { nope: 0, skip: 9 } })
    state = run(state, { type: 'start-game', playerId: 'p0' })

    const cards = allCards(state)
    expect(cards.filter((c) => c.id === 'nope')).toHaveLength(0)
    expect(cards.filter((c) => c.id === 'skip')).toHaveLength(9)
  })

  it('survives a return to the waiting room so it holds for every game in the room', () => {
    let state = newGame(3)
    state = run(state, { type: 'set-deck-overrides', playerId: 'p0', overrides: { nope: 0 } })
    state = run(state, { type: 'start-game', playerId: 'p0' })
    resetToLobby(state, clock++)
    expect(state.deckOverrides).toEqual({ nope: 0 })

    state = run(state, { type: 'start-game', playerId: 'p0' })
    expect(allCards(state).filter((c) => c.id === 'nope')).toHaveLength(0)
  })

  it('refuses to change the deck once the game is under way', () => {
    const state = started(3)
    expect(
      expectRejected(state, { type: 'set-deck-overrides', playerId: 'p0', overrides: { nope: 0 } }).code,
    ).toBe('not-in-lobby')
  })

  it('rejects counts that are not sane integers, leaving the deck alone', () => {
    const state = newGame(3)
    for (const overrides of [{ nope: -1 }, { nope: 1.5 }, { nope: DECK_COUNT_MAX + 1 }]) {
      expectRejected(state, { type: 'set-deck-overrides', playerId: 'p0', overrides })
      expect(state.deckOverrides).toEqual({})
    }
  })

  it('refuses to start when the pinned deck cannot fill everyone’s hand', () => {
    // Zero of every dealable card leaves only kittens and defuses, which are
    // both held back from the deal.
    const overrides = Object.fromEntries(
      ALL_CARD_IDS.filter((id) => id !== 'exploding-kitten' && id !== 'defuse').map((id) => [id, 0]),
    )
    let state = newGame(4)
    state = run(state, { type: 'set-deck-overrides', playerId: 'p0', overrides })
    const rejection = expectRejected(state, { type: 'start-game', playerId: 'p0' })
    expect(rejection.code).toBe('deck-not-enough')
    expect(rejection.params?.needed).toBe(4 * HAND_SIZE)
  })

  it('still deals every player a Defuse when the host pins fewer than one each', () => {
    let state = newGame(4)
    state = run(state, { type: 'set-deck-overrides', playerId: 'p0', overrides: { defuse: 1 } })
    state = run(state, { type: 'start-game', playerId: 'p0' })
    for (const player of state.players) {
      expect(player.hand.filter((c) => c.id === 'defuse')).toHaveLength(1)
    }
    expect(state.drawPile.filter((c) => c.id === 'defuse')).toHaveLength(0)
  })

  it('shows the resolved composition to every viewer, host or not', () => {
    let state = newGame(4)
    state = run(state, { type: 'set-deck-overrides', playerId: 'p0', overrides: { nope: 3 } })
    const view = projectStateFor(state, 'p1')
    expect(view.deck.counts.nope).toBe(3)
    expect(view.deck.counts.skip).toBe(cardCount('skip', 4))
    expect(view.deck.overrides).toEqual({ nope: 3 })
    expect(view.deck.handSize).toBe(HAND_SIZE)
    expect(view.deck.total).toBe(
      Object.values(deckComposition(4, { nope: 3 })).reduce((n, c) => n + c, 0),
    )
  })
})

describe('turn order', () => {
  it('passes the turn on after a draw', () => {
    const state = started(4)
    const first = currentPlayer(state)!
    stackDraw(state, ['skip'])
    const after = run(state, { type: 'draw-card', playerId: first.id })
    expect(currentPlayer(after)!.id).not.toBe(first.id)
    expect(playerById(after, first.id)!.hand).toHaveLength(HAND_SIZE + 2)
  })

  it('refuses a draw from anyone but the current player', () => {
    const state = started(4)
    const other = state.players.find((p) => p.seat !== state.turn.seat)!
    expect(expectRejected(state, { type: 'draw-card', playerId: other.id }).code).toBe('not-your-turn')
  })

  it('Skip ends the turn without drawing', () => {
    const state = started(4)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    setHand(state, player.id, ['skip'])
    const before = state.drawPile.length
    const after = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['skip']),
      combo: null,
    })
    expect(after.drawPile).toHaveLength(before)
    expect(currentPlayer(after)!.id).not.toBe(player.id)
  })
})

describe('attacks', () => {
  it('Attack gives the next player two turns', () => {
    const state = started(4)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    setHand(state, player.id, ['attack-2x'])
    const after = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['attack-2x']),
      combo: null,
    })
    expect(currentPlayer(after)!.id).not.toBe(player.id)
    expect(after.turn.turnsRemaining).toBe(2)
  })

  it('stacks: 2 turns re-attacked becomes 4, then 6', () => {
    let state = started(4)
    removeAllNopes(state)

    const a = currentPlayer(state)!
    setHand(state, a.id, ['attack-2x'])
    state = run(state, { type: 'play-card', playerId: a.id, uids: uidsOf(state, a.id, ['attack-2x']), combo: null })
    expect(state.turn.turnsRemaining).toBe(2)

    const b = currentPlayer(state)!
    setHand(state, b.id, ['attack-2x'])
    state = run(state, { type: 'play-card', playerId: b.id, uids: uidsOf(state, b.id, ['attack-2x']), combo: null })
    expect(state.turn.turnsRemaining).toBe(4)

    const c = currentPlayer(state)!
    setHand(state, c.id, ['attack-2x'])
    state = run(state, { type: 'play-card', playerId: c.id, uids: uidsOf(state, c.id, ['attack-2x']), combo: null })
    expect(state.turn.turnsRemaining).toBe(6)
  })

  it('passes only the base 2 when the attacker has already used up the extra turn', () => {
    let state = started(4)
    removeAllNopes(state)
    const attacker = currentPlayer(state)!
    setHand(state, attacker.id, ['attack-2x'])
    state = run(state, {
      type: 'play-card',
      playerId: attacker.id,
      uids: uidsOf(state, attacker.id, ['attack-2x']),
      combo: null,
    })

    // Victim burns one of their two turns, then attacks with only one left.
    const victim = currentPlayer(state)!
    stackDraw(state, ['skip'])
    state = run(state, { type: 'draw-card', playerId: victim.id })
    expect(state.turn.turnsRemaining).toBe(1)

    setHand(state, victim.id, ['attack-2x'])
    state = run(state, {
      type: 'play-card',
      playerId: victim.id,
      uids: uidsOf(state, victim.id, ['attack-2x']),
      combo: null,
    })
    expect(state.turn.turnsRemaining).toBe(2)
  })

  it('Targeted Attack sends the turns to the chosen player', () => {
    const state = started(4)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const victim = state.players.find((p) => p.id !== player.id)!
    setHand(state, player.id, ['targeted-attack-2x'])
    const after = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['targeted-attack-2x']),
      combo: null,
      targetPlayerId: victim.id,
    })
    expect(currentPlayer(after)!.id).toBe(victim.id)
    expect(after.turn.turnsRemaining).toBe(2)
  })

  it('Personal Attack keeps the turn and gives yourself three', () => {
    const state = started(4)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    setHand(state, player.id, ['personal-attack-3x'])
    const after = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['personal-attack-3x']),
      combo: null,
    })
    expect(currentPlayer(after)!.id).toBe(player.id)
    expect(after.turn.turnsRemaining).toBe(3)
  })

  it('an attacked player owes both turns before play moves on', () => {
    let state = started(3)
    removeAllNopes(state)
    const attacker = currentPlayer(state)!
    setHand(state, attacker.id, ['attack-2x'])
    state = run(state, {
      type: 'play-card',
      playerId: attacker.id,
      uids: uidsOf(state, attacker.id, ['attack-2x']),
      combo: null,
    })

    const victim = currentPlayer(state)!
    stackDraw(state, ['skip', 'skip'])
    state = run(state, { type: 'draw-card', playerId: victim.id })
    expect(currentPlayer(state)!.id).toBe(victim.id)
    expect(state.turn.turnsRemaining).toBe(1)

    state = run(state, { type: 'draw-card', playerId: victim.id })
    expect(currentPlayer(state)!.id).not.toBe(victim.id)
  })
})

describe('reverse', () => {
  it('flips the direction of play', () => {
    const state = started(4)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    setHand(state, player.id, ['reverse'])
    const after = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['reverse']),
      combo: null,
    })
    expect(after.turn.direction).toBe(-1)
    // Play moved backwards around the table, i.e. to the previous seat.
    expect(currentPlayer(after)!.seat).toBe((player.seat + 3) % 4)
  })

  it('acts as a Skip with two players', () => {
    const state = started(2)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    setHand(state, player.id, ['reverse'])
    const after = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['reverse']),
      combo: null,
    })
    expect(currentPlayer(after)!.id).not.toBe(player.id)
  })
})

describe('nope', () => {
  it('opens a window only when someone actually holds a Nope', () => {
    const state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    setHand(state, player.id, ['skip'])
    const after = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['skip']),
      combo: null,
    })
    expect(after.nopeWindow).toBeNull()
    expect(currentPlayer(after)!.id).not.toBe(player.id)
  })

  it('one Nope cancels the action', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const noper = state.players.find((p) => p.id !== player.id)!
    setHand(state, player.id, ['skip'])
    setHand(state, noper.id, ['nope'])

    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['skip']),
      combo: null,
    })
    expect(state.nopeWindow).not.toBeNull()

    state = run(state, {
      type: 'play-card',
      playerId: noper.id,
      uids: uidsOf(state, noper.id, ['nope']),
      combo: null,
    })

    // Nobody left holding a Nope, so the window closed and the Skip died.
    expect(state.nopeWindow).toBeNull()
    expect(currentPlayer(state)!.id).toBe(player.id)
  })

  it('two Nopes cancel each other out and the action goes through', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const others = state.players.filter((p) => p.id !== player.id)
    const noper = others[0]!
    const yupper = others[1]!
    setHand(state, player.id, ['skip'])
    setHand(state, noper.id, ['nope'])
    setHand(state, yupper.id, ['nope'])

    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['skip']),
      combo: null,
    })
    state = run(state, {
      type: 'play-card',
      playerId: noper.id,
      uids: uidsOf(state, noper.id, ['nope']),
      combo: null,
    })
    state = run(state, {
      type: 'play-card',
      playerId: yupper.id,
      uids: uidsOf(state, yupper.id, ['nope']),
      combo: null,
    })

    expect(state.nopeWindow).toBeNull()
    expect(state.actionStack).toHaveLength(0)
    expect(currentPlayer(state)!.id).not.toBe(player.id)
  })

  it('closes early once every eligible player has passed', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const noper = state.players.find((p) => p.id !== player.id)!
    setHand(state, player.id, ['skip'])
    setHand(state, noper.id, ['nope'])

    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['skip']),
      combo: null,
    })
    expect(state.nopeWindow).not.toBeNull()

    state = run(state, { type: 'pass-nope', playerId: noper.id })
    expect(state.nopeWindow).toBeNull()
    expect(currentPlayer(state)!.id).not.toBe(player.id)
  })

  it('closes on the deadline and resolves the action', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const noper = state.players.find((p) => p.id !== player.id)!
    setHand(state, player.id, ['skip'])
    setHand(state, noper.id, ['nope'])

    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['skip']),
      combo: null,
    })
    state = run(state, { type: 'close-nope-window', now: state.nopeWindow!.deadline + 1 } as never)
    expect(state.nopeWindow).toBeNull()
    expect(currentPlayer(state)!.id).not.toBe(player.id)
  })

  it('refuses a Nope against your own card', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const other = state.players.find((p) => p.id !== player.id)!
    setHand(state, player.id, ['skip', 'nope'])
    setHand(state, other.id, ['nope'])

    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['skip']),
      combo: null,
    })
    expect(
      expectRejected(state, {
        type: 'play-card',
        playerId: player.id,
        uids: uidsOf(state, player.id, ['nope']),
        combo: null,
      }).code,
    ).toBe('nope-self')
  })

  it('discards a Noped card anyway', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const noper = state.players.find((p) => p.id !== player.id)!
    setHand(state, player.id, ['skip'])
    setHand(state, noper.id, ['nope'])

    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['skip']),
      combo: null,
    })
    state = run(state, {
      type: 'play-card',
      playerId: noper.id,
      uids: uidsOf(state, noper.id, ['nope']),
      combo: null,
    })
    expect(state.discardPile.map((c) => c.id).sort()).toEqual(['nope', 'skip'])
    expect(playerById(state, player.id)!.hand).toHaveLength(0)
  })
})

describe('exploding kittens', () => {
  it('eliminates a player with no Defuse and hands play on', () => {
    let state = started(3)
    removeAllNopes(state)
    const victim = currentPlayer(state)!
    setHand(state, victim.id, ['skip'])
    stackDraw(state, ['exploding-kitten'])

    state = run(state, { type: 'draw-card', playerId: victim.id })
    expect(playerById(state, victim.id)!.alive).toBe(false)
    expect(currentPlayer(state)!.id).not.toBe(victim.id)
    expect(state.turn.turnsRemaining).toBe(1)
    // Their hand and the kitten are face up in the discard pile.
    expect(state.discardPile.some((c) => c.id === 'exploding-kitten')).toBe(true)
    expect(state.discardPile.some((c) => c.id === 'skip')).toBe(true)
  })

  it('spends a Defuse automatically and asks where the kitten goes', () => {
    let state = started(3)
    removeAllNopes(state)
    const victim = currentPlayer(state)!
    setHand(state, victim.id, ['defuse'])
    stackDraw(state, ['exploding-kitten'])

    state = run(state, { type: 'draw-card', playerId: victim.id })
    expect(playerById(state, victim.id)!.alive).toBe(true)
    expect(state.interaction?.kind).toBe('choose-deck-position')
    expect(state.interaction?.requiredFrom).toEqual([victim.id])
    expect(playerById(state, victim.id)!.hand).toHaveLength(0)

    const index = 3
    state = run(state, {
      type: 'submit-interaction',
      playerId: victim.id,
      interactionId: state.interaction!.id,
      response: { type: 'position', index },
    })
    expect(state.interaction).toBeNull()
    expect(state.drawPile[index]!.id).toBe('exploding-kitten')
    expect(state.limbo).toHaveLength(0)
    // Defusing consumed the turn.
    expect(currentPlayer(state)!.id).not.toBe(victim.id)
  })

  it('accepts the very bottom of the draw pile as a hiding place', () => {
    let state = started(3)
    removeAllNopes(state)
    const victim = currentPlayer(state)!
    setHand(state, victim.id, ['defuse'])
    stackDraw(state, ['exploding-kitten'])
    state = run(state, { type: 'draw-card', playerId: victim.id })

    // One past the last index is the bottom, and it is legal.
    const bottom = state.drawPile.length
    state = run(state, {
      type: 'submit-interaction',
      playerId: victim.id,
      interactionId: state.interaction!.id,
      response: { type: 'position', index: bottom },
    })
    expect(state.drawPile[state.drawPile.length - 1]!.id).toBe('exploding-kitten')
    expect(state.limbo).toHaveLength(0)
  })

  it('refuses a hiding place that is off the deck entirely', () => {
    let state = started(3)
    removeAllNopes(state)
    const victim = currentPlayer(state)!
    setHand(state, victim.id, ['defuse'])
    stackDraw(state, ['exploding-kitten'])
    state = run(state, { type: 'draw-card', playerId: victim.id })

    for (const index of [-1, state.drawPile.length + 1]) {
      expect(
        expectRejected(state, {
          type: 'submit-interaction',
          playerId: victim.id,
          interactionId: state.interaction!.id,
          response: { type: 'position', index },
        }).code,
      ).toBe('invalid-position')
    }
    // Rejected, so the kitten is still waiting in limbo for a real answer.
    expect(state.limbo).toHaveLength(1)
  })

  it('puts the kitten back on top when nobody answers in time', () => {
    let state = started(3)
    removeAllNopes(state)
    const victim = currentPlayer(state)!
    setHand(state, victim.id, ['defuse'])
    stackDraw(state, ['exploding-kitten'])
    state = run(state, { type: 'draw-card', playerId: victim.id })

    state = run(state, { type: 'timeout-interaction' })
    expect(state.interaction).toBeNull()
    expect(state.limbo).toHaveLength(0)
    // The honest default: on top, where the next player will meet it.
    expect(state.drawPile[0]!.id).toBe('exploding-kitten')
    expect(currentPlayer(state)!.id).not.toBe(victim.id)
  })

  it('ends the game when only one player is left', () => {
    let state = started(2)
    removeAllNopes(state)
    const victim = currentPlayer(state)!
    const survivor = state.players.find((p) => p.id !== victim.id)!
    setHand(state, victim.id, [])
    stackDraw(state, ['exploding-kitten'])

    state = run(state, { type: 'draw-card', playerId: victim.id })
    expect(state.status).toBe('over')
    expect(state.winnerId).toBe(survivor.id)
  })
})

describe('quit game', () => {
  it('eliminates the quitter and continues when others remain', () => {
    const state = started(3)
    const quitter = currentPlayer(state)!

    const after = run(state, { type: 'quit-game', playerId: quitter.id })
    expect(after.status).toBe('playing')
    expect(playerById(after, quitter.id)!.alive).toBe(false)
    expect(playerById(after, quitter.id)!.hand).toHaveLength(0)
    expect(after.discardPile.length).toBeGreaterThan(0)
  })

  it('ends the game when the second-to-last player quits', () => {
    const state = started(2)
    const quitter = currentPlayer(state)!
    const survivor = state.players.find((p) => p.id !== quitter.id)!

    const after = run(state, { type: 'quit-game', playerId: quitter.id })
    expect(after.status).toBe('over')
    expect(after.winnerId).toBe(survivor.id)
  })

  it('advances the turn when the current player quits', () => {
    const state = started(4)
    const quitter = currentPlayer(state)!

    const after = run(state, { type: 'quit-game', playerId: quitter.id })
    expect(currentPlayer(after)!.id).not.toBe(quitter.id)
    expect(playerById(after, currentPlayer(after)!.id)!.alive).toBe(true)
  })

  it('does not change whose turn it is when a non-current player quits', () => {
    const state = started(4)
    const current = currentPlayer(state)!
    const other = state.players.find((p) => p.id !== current.id)!

    const after = run(state, { type: 'quit-game', playerId: other.id })
    expect(currentPlayer(after)!.id).toBe(current.id)
  })

  it('refuses to quit before the game starts', () => {
    const state = newGame(3)
    expect(expectRejected(state, { type: 'quit-game', playerId: 'p0' }).code).toBe('game-not-started')
  })

  it('refuses to quit twice', () => {
    let state = started(3)
    const quitter = currentPlayer(state)!
    state = run(state, { type: 'quit-game', playerId: quitter.id })
    expect(expectRejected(state, { type: 'quit-game', playerId: quitter.id }).code).toBe('already-left')
  })

  it('refuses to quit for a player not in the game', () => {
    const state = started(3)
    expect(expectRejected(state, { type: 'quit-game', playerId: 'nobody' }).code).toBe('not-in-game')
  })
})

describe('return to lobby', () => {
  /**
   * Runs quit-game until one player remains, then restores everyone's
   * `connected` flag. Quitting also disconnects (it is a real leave), but a
   * normal in-game elimination (e.g. exploding) does not — these tests care
   * about the ready-up gating, not the elimination path, so they need a
   * finished game where every original player is still "at the table".
   */
  function ended(playerCount: number, seed = 42): GameState {
    let state = started(playerCount, seed)
    while (state.status === 'playing') {
      state = run(state, { type: 'quit-game', playerId: currentPlayer(state)!.id })
    }
    state.players.forEach((p) => (p.connected = true))
    return state
  }

  it('refuses before the game is over', () => {
    const state = started(3)
    expect(expectRejected(state, { type: 'return-to-lobby', playerId: 'p0' }).code).toBe('game-not-over')
  })

  it('refuses for a player not in the game', () => {
    const state = ended(3)
    expect(expectRejected(state, { type: 'return-to-lobby', playerId: 'nobody' }).code).toBe('not-in-game')
  })

  it('marks a player ready idempotently, without transitioning on a single click', () => {
    const state = ended(3)
    const after = run(state, { type: 'return-to-lobby', playerId: 'p0' })
    expect(after.status).toBe('over')
    expect(playerById(after, 'p0')!.ready).toBe(true)
    expect(playerById(after, 'p1')!.ready).toBe(false)
    expect(playerById(after, 'p2')!.ready).toBe(false)

    // Clicking again is a no-op, not an error.
    const again = run(after, { type: 'return-to-lobby', playerId: 'p0' })
    expect(again.status).toBe('over')
  })

  it('transitions the whole room to lobby once every connected player is ready', () => {
    let state = ended(3)
    state = run(state, { type: 'return-to-lobby', playerId: 'p0' })
    state = run(state, { type: 'return-to-lobby', playerId: 'p1' })
    expect(state.status).toBe('over')

    const seating = state.players.map((p) => ({ id: p.id, seat: p.seat }))
    state = run(state, { type: 'return-to-lobby', playerId: 'p2' })

    expect(state.status).toBe('lobby')
    expect(state.winnerId).toBeNull()
    expect(state.drawPile).toHaveLength(0)
    expect(state.discardPile).toHaveLength(0)
    expect(state.actionStack).toHaveLength(0)
    expect(state.interaction).toBeNull()
    expect(state.nopeWindow).toBeNull()
    for (const player of state.players) {
      expect(player.hand).toHaveLength(0)
      expect(player.alive).toBe(true)
      expect(player.ready).toBe(false)
    }
    expect(state.players.map((p) => ({ id: p.id, seat: p.seat }))).toEqual(seating)
  })

  it('a disconnected player does not block the reset', () => {
    let state = ended(3)
    playerById(state, 'p2')!.connected = false

    state = run(state, { type: 'return-to-lobby', playerId: 'p0' })
    expect(state.status).toBe('over')
    state = run(state, { type: 'return-to-lobby', playerId: 'p1' })

    expect(state.status).toBe('lobby')
  })

  it('deals a different shuffle on the round-two start-game', () => {
    let state = ended(3)
    state = run(state, { type: 'return-to-lobby', playerId: 'p0' })
    state = run(state, { type: 'return-to-lobby', playerId: 'p1' })
    state = run(state, { type: 'return-to-lobby', playerId: 'p2' })
    expect(state.status).toBe('lobby')

    state = run(state, { type: 'start-game', playerId: 'p0' })
    const roundTwoDraw = state.drawPile.map((c) => c.id)

    const roundOneDraw = started(3).drawPile.map((c) => c.id)

    // Same seed, but rngState carried forward through round one — a reset to
    // `state.seed` here would deal the identical shuffle as round one.
    expect(roundTwoDraw).not.toEqual(roundOneDraw)
  })
})

describe('cat combos', () => {
  it('a matching pair steals a random card', () => {
    const state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const victim = state.players.find((p) => p.id !== player.id)!
    setHand(state, player.id, ['tacocat', 'tacocat'])
    setHand(state, victim.id, ['shuffle'])

    const after = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['tacocat', 'tacocat']),
      combo: 'pair',
      targetPlayerId: victim.id,
    })
    expect(playerById(after, victim.id)!.hand).toHaveLength(0)
    expect(playerById(after, player.id)!.hand.map((c) => c.id)).toEqual(['shuffle'])
  })

  it('Feral Cat stands in for any cat in a pair', () => {
    const state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const victim = state.players.find((p) => p.id !== player.id)!
    setHand(state, player.id, ['beard-cat', 'feral-cat'])
    setHand(state, victim.id, ['shuffle'])

    const after = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['beard-cat', 'feral-cat']),
      combo: 'pair',
      targetPlayerId: victim.id,
    })
    expect(playerById(after, player.id)!.hand.map((c) => c.id)).toEqual(['shuffle'])
  })

  it('rejects a pair of different cats', () => {
    const state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const victim = state.players.find((p) => p.id !== player.id)!
    setHand(state, player.id, ['beard-cat', 'tacocat'])
    setHand(state, victim.id, ['shuffle'])

    expect(
      expectRejected(state, {
        type: 'play-card',
        playerId: player.id,
        uids: uidsOf(state, player.id, ['beard-cat', 'tacocat']),
        combo: 'pair',
        targetPlayerId: victim.id,
      }).code,
    ).toBe('cat-combo-mismatch')
  })

  it('three of a kind demands a named card, and gets nothing if absent', () => {
    const state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const victim = state.players.find((p) => p.id !== player.id)!
    setHand(state, player.id, ['tacocat', 'tacocat', 'feral-cat'])
    setHand(state, victim.id, ['shuffle', 'favor'])

    const hit = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['tacocat', 'tacocat', 'feral-cat']),
      combo: 'triple',
      targetPlayerId: victim.id,
      namedCardId: 'favor',
    })
    expect(playerById(hit, player.id)!.hand.map((c) => c.id)).toEqual(['favor'])
    expect(playerById(hit, victim.id)!.hand.map((c) => c.id)).toEqual(['shuffle'])

    const miss = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['tacocat', 'tacocat', 'feral-cat']),
      combo: 'triple',
      targetPlayerId: victim.id,
      namedCardId: 'attack-2x',
    })
    expect(playerById(miss, player.id)!.hand).toHaveLength(0)
    expect(playerById(miss, victim.id)!.hand).toHaveLength(2)
  })

  it('five different cards take any card from the discard pile', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    setHand(state, player.id, ['skip', 'shuffle', 'favor', 'attack-2x', 'reverse'])
    state.discardPile = [makeCard('defuse'), makeCard('see-the-future-3x')]
    const wanted = state.discardPile[1]!.uid

    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['skip', 'shuffle', 'favor', 'attack-2x', 'reverse']),
      combo: 'five-different',
    })
    expect(state.interaction?.kind).toBe('choose-from-discard')

    state = run(state, {
      type: 'submit-interaction',
      playerId: player.id,
      interactionId: state.interaction!.id,
      response: { type: 'card', uid: wanted },
    })
    expect(playerById(state, player.id)!.hand.map((c) => c.id)).toEqual(['see-the-future-3x'])
  })

  it('refuses a single cat card played alone', () => {
    const state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    setHand(state, player.id, ['tacocat'])
    expect(
      expectRejected(state, {
        type: 'play-card',
        playerId: player.id,
        uids: uidsOf(state, player.id, ['tacocat']),
        combo: null,
      }).code,
    ).toBe('cat-solo-not-allowed')
  })
})

describe('steal a card', () => {
  it('takes one card from the chosen player and keeps the turn', () => {
    const state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const victim = state.players.find((p) => p.id !== player.id)!
    setHand(state, player.id, ['steal-a-card'])
    setHand(state, victim.id, ['shuffle'])

    const after = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['steal-a-card']),
      combo: null,
      targetPlayerId: victim.id,
    })
    expect(playerById(after, victim.id)!.hand).toHaveLength(0)
    expect(playerById(after, player.id)!.hand.map((c) => c.id)).toEqual(['shuffle'])
    // Stealing costs a card, not the turn.
    expect(currentPlayer(after)!.id).toBe(player.id)
  })

  /**
   * Every rejection has to come back as a `Rejection` code, never as prose:
   * the socket layer reports `error.code` and the client looks the text up in
   * its own locale. A bare string here reaches the player as an empty error.
   */
  it('refuses an eliminated target, yourself, and an empty-handed target, by code', () => {
    const state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const victim = state.players.find((p) => p.id !== player.id)!
    const dead = state.players.find((p) => p.id !== player.id && p.id !== victim.id)!
    dead.alive = false
    setHand(state, player.id, ['steal-a-card', 'steal-a-card', 'steal-a-card'])
    setHand(state, victim.id, [])

    const play = (targetPlayerId: string) => ({
      type: 'play-card' as const,
      playerId: player.id,
      uids: uidsOf(state, player.id, ['steal-a-card']),
      combo: null,
      targetPlayerId,
    })

    expect(expectRejected(state, play(dead.id)).code).toBe('invalid-target')
    expect(expectRejected(state, play(player.id)).code).toBe('cant-target-self')

    const empty = expectRejected(state, play(victim.id))
    expect(empty.code).toBe('target-empty-handed')
    expect(empty.params).toEqual({ name: victim.nickname })
  })
})

describe('favor', () => {
  it('lets the target choose which card to hand over', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const target = state.players.find((p) => p.id !== player.id)!
    setHand(state, player.id, ['favor'])
    setHand(state, target.id, ['skip', 'shuffle'])
    const chosen = playerById(state, target.id)!.hand[1]!.uid

    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['favor']),
      combo: null,
      targetPlayerId: target.id,
    })
    expect(state.interaction?.requiredFrom).toEqual([target.id])

    state = run(state, {
      type: 'submit-interaction',
      playerId: target.id,
      interactionId: state.interaction!.id,
      response: { type: 'card', uid: chosen },
    })
    expect(playerById(state, player.id)!.hand.map((c) => c.id)).toEqual(['shuffle'])
    expect(playerById(state, target.id)!.hand.map((c) => c.id)).toEqual(['skip'])
  })

  it('refuses a favor from a player with no cards', () => {
    const state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const target = state.players.find((p) => p.id !== player.id)!
    setHand(state, player.id, ['favor'])
    setHand(state, target.id, [])
    const rejection = expectRejected(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['favor']),
      combo: null,
      targetPlayerId: target.id,
    })
    expect(rejection.code).toBe('target-empty-handed')
    expect(rejection.params?.name).toBe(target.nickname)
  })
})

describe('the future', () => {
  it('See the Future shows the top three cards to that player only', () => {
    const state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    setHand(state, player.id, ['see-the-future-3x'])
    stackDraw(state, ['skip', 'favor', 'shuffle'])

    const after = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['see-the-future-3x']),
      combo: null,
    })
    expect(after.peeks[player.id]!.map((c) => c.id)).toEqual(['skip', 'favor', 'shuffle'])

    const other = after.players.find((p) => p.id !== player.id)!
    expect(projectStateFor(after, other.id).you!.peek).toBeNull()
    expect(projectStateFor(after, player.id).you!.peek!.map((c) => c.id)).toEqual([
      'skip',
      'favor',
      'shuffle',
    ])
  })

  it('Alter the Future rewrites the top of the deck in the chosen order', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    setHand(state, player.id, ['alter-the-future-3x'])
    stackDraw(state, ['skip', 'favor', 'shuffle'])

    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['alter-the-future-3x']),
      combo: null,
    })
    expect(state.interaction?.kind).toBe('reorder-cards')
    const shown = state.interaction!.cards!.map((c) => c.uid)

    state = run(state, {
      type: 'submit-interaction',
      playerId: player.id,
      interactionId: state.interaction!.id,
      response: { type: 'order', uids: [shown[2]!, shown[0]!, shown[1]!] },
    })
    expect(state.drawPile.slice(0, 3).map((c) => c.id)).toEqual(['shuffle', 'skip', 'favor'])
  })

  it('See the Future 5x looks five deep, and stops at the bottom of a short pile', () => {
    const state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    setHand(state, player.id, ['see-the-future-5x', 'see-the-future-5x'])
    stackDraw(state, ['skip', 'favor', 'shuffle', 'nope', 'reverse'])

    const deep = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['see-the-future-5x']),
      combo: null,
    })
    expect(deep.peeks[player.id]!.map((c) => c.id)).toEqual([
      'skip',
      'favor',
      'shuffle',
      'nope',
      'reverse',
    ])

    // Two cards left is all there is to see — no padding, no crash.
    state.drawPile = state.drawPile.slice(0, 2)
    const short = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['see-the-future-5x']),
      combo: null,
    })
    expect(short.peeks[player.id]).toHaveLength(2)
  })

  it('Alter the Future 5x reorders five cards', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    setHand(state, player.id, ['alter-the-future-5x'])
    stackDraw(state, ['skip', 'favor', 'shuffle', 'nope', 'reverse'])

    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['alter-the-future-5x']),
      combo: null,
    })
    expect(state.interaction?.kind).toBe('reorder-cards')
    const shown = state.interaction!.cards!
    expect(shown).toHaveLength(5)

    state = run(state, {
      type: 'submit-interaction',
      playerId: player.id,
      interactionId: state.interaction!.id,
      response: { type: 'order', uids: [...shown].reverse().map((c) => c.uid) },
    })
    expect(state.drawPile.slice(0, 5).map((c) => c.id)).toEqual([
      'reverse',
      'nope',
      'shuffle',
      'favor',
      'skip',
    ])
  })

  it('rejects a reordering that invents or drops cards', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    setHand(state, player.id, ['alter-the-future-3x'])
    stackDraw(state, ['skip', 'favor', 'shuffle'])
    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['alter-the-future-3x']),
      combo: null,
    })
    const shown = state.interaction!.cards!.map((c) => c.uid)
    expect(
      expectRejected(state, {
        type: 'submit-interaction',
        playerId: player.id,
        interactionId: state.interaction!.id,
        response: { type: 'order', uids: [shown[0]!, shown[0]!, shown[1]!] },
      }).code,
    ).toBe('invalid-order')
  })
})

describe('shuffle', () => {
  it('reorders the draw pile, blinds everyone who had peeked, and keeps the turn', () => {
    const state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const other = state.players.find((p) => p.id !== player.id)!
    setHand(state, player.id, ['shuffle'])
    // Someone looked at the top of the deck a moment ago.
    state.peeks[other.id] = state.drawPile.slice(0, 3).map((c) => ({ ...c }))
    const before = state.drawPile.map((c) => c.uid)

    const after = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['shuffle']),
      combo: null,
    })
    const now = after.drawPile.map((c) => c.uid)
    expect(now).not.toEqual(before)
    expect([...now].sort()).toEqual([...before].sort())
    expect(after.peeks).toEqual({})
    // Shuffling is not an end to the turn — you still have to draw.
    expect(currentPlayer(after)!.id).toBe(player.id)
  })
})

describe('draw from the bottom', () => {
  it('takes the last card instead of the first', () => {
    const state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    setHand(state, player.id, ['draw-from-the-bottom'])
    const bottom = state.drawPile[state.drawPile.length - 1]!

    const after = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['draw-from-the-bottom']),
      combo: null,
    })
    expect(playerById(after, player.id)!.hand.map((c) => c.uid)).toContain(bottom.uid)
    expect(currentPlayer(after)!.id).not.toBe(player.id)
  })
})

describe('garbage collection', () => {
  it('collects one card from everyone and deals the pile back out', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const [a, b] = state.players.filter((p) => p.id !== player.id)
    setHand(state, player.id, ['garbage-collection', 'skip'])
    setHand(state, a!.id, ['favor', 'shuffle'])
    setHand(state, b!.id, ['reverse'])

    const totalBefore = state.players.reduce((n, p) => n + p.hand.length, 0)

    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['garbage-collection']),
      combo: null,
    })
    expect(state.interaction?.kind).toBe('simultaneous-choose-card')
    expect(state.interaction!.requiredFrom.sort()).toEqual([player.id, a!.id, b!.id].sort())

    for (const id of [player.id, a!.id, b!.id]) {
      const hand = playerById(state, id)!.hand
      state = run(state, {
        type: 'submit-interaction',
        playerId: id,
        interactionId: state.interaction!.id,
        response: { type: 'card', uid: hand[0]!.uid },
      })
    }

    // Everyone answered, but the prompt runs its full clock so players can
    // still switch cards — only the deadline closes it.
    expect(state.interaction).not.toBeNull()
    state = run(state, { type: 'timeout-interaction' } as never)

    expect(state.interaction).toBeNull()
    // Cards move around but none are created or destroyed.
    const totalAfter = state.players.reduce((n, p) => n + p.hand.length, 0)
    expect(totalAfter).toBe(totalBefore - 1) // the garbage-collection card itself was discarded
  })

  it('lets a player switch their pick until the deadline', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const [a, b] = state.players.filter((p) => p.id !== player.id)
    setHand(state, player.id, ['garbage-collection', 'skip', 'favor'])
    setHand(state, a!.id, ['shuffle'])
    setHand(state, b!.id, ['reverse'])

    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['garbage-collection']),
      combo: null,
    })

    const hand = playerById(state, player.id)!.hand
    const first = hand[0]!.uid
    const second = hand[1]!.uid

    state = run(state, {
      type: 'submit-interaction',
      playerId: player.id,
      interactionId: state.interaction!.id,
      response: { type: 'card', uid: first },
    })
    expect(state.interaction!.responses[player.id]).toEqual({ type: 'card', uid: first })

    // Re-submitting overwrites the earlier pick instead of being rejected.
    state = run(state, {
      type: 'submit-interaction',
      playerId: player.id,
      interactionId: state.interaction!.id,
      response: { type: 'card', uid: second },
    })
    expect(state.interaction!.responses[player.id]).toEqual({ type: 'card', uid: second })
  })

  it('never deals an Exploding Kitten back into a hand', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const [a, b] = state.players.filter((p) => p.id !== player.id)
    setHand(state, player.id, ['garbage-collection', 'skip'])
    setHand(state, a!.id, ['favor'])
    setHand(state, b!.id, ['reverse'])

    // Mostly kittens: only three safe cards exist for the three contributors,
    // so a naive "deal off the top" would hand someone a kitten.
    state.drawPile = [
      ...Array.from({ length: 8 }, () => makeCard('exploding-kitten')),
      ...(['skip', 'shuffle', 'attack'] as CardId[]).map((id) => makeCard(id)),
    ]
    const kittensBefore = state.drawPile.filter((c) => c.id === 'exploding-kitten').length

    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['garbage-collection']),
      combo: null,
    })
    for (const id of [player.id, a!.id, b!.id]) {
      const hand = playerById(state, id)!.hand
      state = run(state, {
        type: 'submit-interaction',
        playerId: id,
        interactionId: state.interaction!.id,
        response: { type: 'card', uid: hand[0]!.uid },
      })
    }
    state = run(state, { type: 'timeout-interaction' } as never)

    for (const p of state.players) {
      expect(p.hand.filter((c) => c.id === 'exploding-kitten')).toHaveLength(0)
    }
    // The skipped kittens stay in the deck rather than being destroyed.
    expect(state.drawPile.filter((c) => c.id === 'exploding-kitten')).toHaveLength(kittensBefore)
    // Each contributor still got a card back.
    for (const id of [player.id, a!.id, b!.id]) {
      expect(playerById(state, id)!.hand.length).toBeGreaterThan(0)
    }
  })
})

describe('turn timeout', () => {
  it('draws for whoever ran out of time and hands play on', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const before = playerById(state, player.id)!.hand.length
    stackDraw(state, ['skip'])

    state = run(state, { type: 'timeout-turn' })
    expect(playerById(state, player.id)!.hand).toHaveLength(before + 1)
    expect(currentPlayer(state)!.id).not.toBe(player.id)
  })

  it('explodes the player if the forced draw is a kitten', () => {
    let state = started(3)
    removeAllNopes(state)
    const victim = currentPlayer(state)!
    setHand(state, victim.id, ['skip'])
    stackDraw(state, ['exploding-kitten'])

    state = run(state, { type: 'timeout-turn' })
    expect(playerById(state, victim.id)!.alive).toBe(false)
    expect(currentPlayer(state)!.id).not.toBe(victim.id)
  })

  it('stays out of the way while a prompt is open', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const target = state.players.find((p) => p.id !== player.id)!
    setHand(state, player.id, ['favor'])
    setHand(state, target.id, ['skip', 'shuffle'])
    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['favor']),
      combo: null,
      targetPlayerId: target.id,
    })

    const drawCount = state.drawPile.length
    state = run(state, { type: 'timeout-turn' })
    // The interaction owns the clock now — the turn timer must not also fire.
    expect(state.interaction?.kind).toBe('choose-card-from-hand')
    expect(state.drawPile).toHaveLength(drawCount)
    expect(currentPlayer(state)!.id).toBe(player.id)
  })

  it('stays out of the way while a Nope window is open', () => {
    let state = started(3)
    const player = currentPlayer(state)!
    const other = state.players.find((p) => p.id !== player.id)!
    setHand(state, player.id, ['skip'])
    setHand(state, other.id, ['nope'])
    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['skip']),
      combo: null,
    })
    expect(state.nopeWindow).not.toBeNull()

    const drawCount = state.drawPile.length
    state = run(state, { type: 'timeout-turn' })
    expect(state.nopeWindow).not.toBeNull()
    expect(state.drawPile).toHaveLength(drawCount)
  })
})

describe('projection', () => {
  it('never leaks another player’s hand or the draw pile', () => {
    const state = started(6)
    const viewer = state.players[2]!
    const view = projectStateFor(state, viewer.id)

    const visible = uidsIn(view)
    for (const player of state.players) {
      if (player.id === viewer.id) continue
      for (const card of player.hand) {
        expect(visible.has(card.uid)).toBe(false)
      }
    }
    for (const card of state.drawPile) {
      expect(visible.has(card.uid)).toBe(false)
    }
    expect(view.drawCount).toBe(state.drawPile.length)
    expect(view.you!.hand).toHaveLength(HAND_SIZE + 1)
  })

  it('hides an interaction’s private cards and context from bystanders', () => {
    let state = started(3)
    removeAllNopes(state)
    const player = currentPlayer(state)!
    const target = state.players.find((p) => p.id !== player.id)!
    const bystander = state.players.find((p) => p.id !== player.id && p.id !== target.id)!
    setHand(state, player.id, ['favor'])
    setHand(state, target.id, ['skip', 'shuffle'])

    state = run(state, {
      type: 'play-card',
      playerId: player.id,
      uids: uidsOf(state, player.id, ['favor']),
      combo: null,
      targetPlayerId: target.id,
    })

    const targetView = projectStateFor(state, target.id)
    expect(targetView.interaction!.isForYou).toBe(true)
    expect(targetView.interaction!.cards).toHaveLength(2)

    const bystanderView = projectStateFor(state, bystander.id)
    expect(bystanderView.interaction!.isForYou).toBe(false)
    expect(bystanderView.interaction!.cards).toBeUndefined()
    expect(uidsIn(bystanderView).has(playerById(state, target.id)!.hand[0]!.uid)).toBe(false)
  })

  it('gives a spectator the table without a seat or anyone’s cards', () => {
    // Someone who arrives mid-game has no player id; `_ws.ts` projects for
    // `null` and they watch until a seat opens up.
    const state = started(4)
    const view = projectStateFor(state, null)

    expect(view.you).toBeNull()
    const visible = uidsIn(view)
    for (const player of state.players) {
      for (const card of player.hand) expect(visible.has(card.uid)).toBe(false)
    }
    for (const card of state.drawPile) expect(visible.has(card.uid)).toBe(false)

    // They still see everything that is public, so the table renders.
    expect(view.drawCount).toBe(state.drawPile.length)
    expect(view.players).toHaveLength(4)
    expect(view.currentPlayerId).toBe(currentPlayer(state)!.id)
  })

  it('hides where a defused kitten was hidden', () => {
    let state = started(3)
    removeAllNopes(state)
    const victim = currentPlayer(state)!
    setHand(state, victim.id, ['defuse'])
    stackDraw(state, ['exploding-kitten'])
    state = run(state, { type: 'draw-card', playerId: victim.id })

    const other = state.players.find((p) => p.id !== victim.id)!
    const view = projectStateFor(state, other.id)
    expect(uidsIn(view).has(state.limbo[0]!.uid)).toBe(false)
  })
})

describe('determinism', () => {
  it('replays a command log to a byte-identical state', () => {
    const commands: Command[] = []
    const build = (seed: number) => {
      let state = createGame('replay', seed)
      for (let i = 0; i < 4; i++) addPlayer(state, `p${i}`, `Player ${i}`, 'art_02')
      return state
    }

    const script = (state: GameState, record: boolean): GameState => {
      let current = state
      let at = 1_000
      for (let i = 0; i < 25; i++) {
        const player = currentPlayer(current)
        if (!player || current.status !== 'playing') break
        if (current.interaction) {
          const responder = current.interaction.requiredFrom[0]!
          const hand = playerById(current, responder)!.hand
          const command: Command = {
            type: 'submit-interaction',
            playerId: responder,
            interactionId: current.interaction.id,
            response:
              current.interaction.kind === 'choose-deck-position'
                ? { type: 'position', index: 2 }
                : { type: 'card', uid: hand[0]!.uid },
            now: (at += 100),
          }
          if (record) commands.push(command)
          current = reduce(current, command).state
          continue
        }
        if (current.nopeWindow) {
          const command: Command = { type: 'close-nope-window', now: (at += 100) }
          if (record) commands.push(command)
          current = reduce(current, command).state
          continue
        }
        const command: Command = { type: 'draw-card', playerId: player.id, now: (at += 100) }
        if (record) commands.push(command)
        current = reduce(current, command).state
      }
      return current
    }

    let first = build(777)
    first = reduce(first, { type: 'start-game', playerId: 'p0', now: 500 }).state
    const finalFirst = script(first, true)

    let second = build(777)
    second = reduce(second, { type: 'start-game', playerId: 'p0', now: 500 }).state
    let replayed = second
    for (const command of commands) replayed = reduce(replayed, command).state

    expect(replayed.rngState).toBe(finalFirst.rngState)
    expect(replayed.players.map((p) => p.hand.map((c) => c.id))).toEqual(
      finalFirst.players.map((p) => p.hand.map((c) => c.id)),
    )
    expect(replayed.drawPile.map((c) => c.id)).toEqual(finalFirst.drawPile.map((c) => c.id))
    expect(replayed.log).toEqual(finalFirst.log)
  })
})

describe('lobby rules', () => {
  it('needs at least two players to start', () => {
    const state = newGame(1)
    const rejection = expectRejected(state, { type: 'start-game', playerId: 'p0' })
    expect(rejection.code).toBe('min-players')
    expect(rejection.params?.min).toBe(2)
  })

  it('caps the room at ten players', () => {
    const state = newGame(10)
    expect(addPlayer(state, 'p10', 'Overflow', 'art_02')?.code).toBe('room-full')
    expect(state.players).toHaveLength(10)
  })

  it('refuses to start twice', () => {
    const state = started(3)
    expect(expectRejected(state, { type: 'start-game', playerId: 'p0' }).code).toBe('game-already-started')
  })

  it('frees the seat of someone who leaves the waiting room', () => {
    const state = newGame(3)
    removePlayer(state, 'p1')
    expect(state.players.map((p) => p.id)).toEqual(['p0', 'p2'])
    expect(state.players.map((p) => p.seat)).toEqual([0, 1])
  })

  it('frees the seat of someone who leaves the results screen too', () => {
    const state = newGame(3)
    state.status = 'over'
    removePlayer(state, 'p0')
    expect(state.players.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(state.players.map((p) => p.seat)).toEqual([0, 1])
  })

  it('eliminates rather than removes someone who leaves mid-game', () => {
    const state = started(3)
    removePlayer(state, 'p1')
    const gone = playerById(state, 'p1')!
    expect(gone.alive).toBe(false)
    expect(gone.hand).toHaveLength(0)
    // Seats stay put so turn order is unaffected.
    expect(state.players.map((p) => p.seat)).toEqual([0, 1, 2])
  })
})
