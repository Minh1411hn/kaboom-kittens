import catalog from '../cards/catalog.json'

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** Declared explicitly rather than inferred: a JSON import widens `id` to
 *  `string`, which would erase every CardId check. `assertCatalogMatchesUnion`
 *  below fails loudly if the two ever drift apart. */
export type CardId =
  | 'exploding-kitten'
  | 'defuse'
  | 'nope'
  | 'attack-2x'
  | 'targeted-attack-2x'
  | 'personal-attack-3x'
  | 'skip'
  | 'reverse'
  | 'shuffle'
  | 'favor'
  | 'steal-a-card'
  | 'draw-from-the-bottom'
  | 'see-the-future-3x'
  | 'see-the-future-5x'
  | 'alter-the-future-3x'
  | 'alter-the-future-5x'
  | 'garbage-collection'
  | 'tacocat'
  | 'cattermelon'
  | 'hairy-potato-cat'
  | 'rainbow-ralphing-cat'
  | 'beard-cat'
  | 'feral-cat'

export const ALL_CARD_IDS: CardId[] = [
  'exploding-kitten',
  'defuse',
  'nope',
  'attack-2x',
  'targeted-attack-2x',
  'personal-attack-3x',
  'skip',
  'reverse',
  'shuffle',
  'favor',
  'steal-a-card',
  'draw-from-the-bottom',
  'see-the-future-3x',
  'see-the-future-5x',
  'alter-the-future-3x',
  'alter-the-future-5x',
  'garbage-collection',
  'tacocat',
  'cattermelon',
  'hairy-potato-cat',
  'rainbow-ralphing-cat',
  'beard-cat',
  'feral-cat',
]

export type CardCategory = 'kitten' | 'defuse' | 'action' | 'cat'

export interface CatalogEntry {
  id: CardId
  name: string
  /**
   * Short effect phrase the card frame prints above the title, e.g. "Skip" or
   * "Demand a card". Presentation only — the engine never reads it.
   */
  label: string
  category: CardCategory
  /**
   * Artwork folder when it is not the card's own id. The five named cat cards
   * share one pool under `public/cards/normal-cat/artworks/`, and each id is
   * pinned to a different picture in it. Presentation only — the engine never
   * reads this, and `useCardArt.ts` is its sole consumer.
   */
  art?: string
  deck: { base?: number; min?: number; formula?: 'players-minus-1' | 'defuse' }
  color: string
  text: string
  /**
   * Hints so the client can grey out illegal cards and prompt for a target
   * before sending. The server is still authoritative and revalidates
   * everything; `catalog.test.ts` asserts these never drift from the registry.
   */
  play: { solo: boolean; target?: boolean; anytime?: boolean }
}

export const CARD_CATALOG = catalog.cards as unknown as CatalogEntry[]
export const CARD_BY_ID = Object.fromEntries(CARD_CATALOG.map((c) => [c.id, c])) as Record<
  CardId,
  CatalogEntry
>
export const HAND_SIZE = catalog.handSize

/**
 * Absolute per-card counts the host pinned in the waiting room, overriding the
 * player-count scaling in `deck.ts`. A card absent from this map still scales.
 */
export type DeckOverrides = Partial<Record<CardId, number>>

/** Upper bound for a single card's count, so one number cannot blow up a room. */
export const DECK_COUNT_MAX = 60

/** Guards against catalog.json and the CardId union drifting apart. */
export function assertCatalogMatchesUnion(): void {
  const inCatalog = new Set(CARD_CATALOG.map((c) => c.id))
  const missing = ALL_CARD_IDS.filter((id) => !inCatalog.has(id))
  const extra = [...inCatalog].filter((id) => !ALL_CARD_IDS.includes(id))
  if (missing.length || extra.length) {
    throw new Error(
      `catalog.json out of sync with CardId union. Missing: [${missing.join(', ')}]. Unknown: [${extra.join(', ')}]`,
    )
  }
}

export const isCatCard = (id: CardId): boolean => CARD_BY_ID[id].category === 'cat'

/** A physical card. `uid` is stable for the whole game, which lets the client
 *  keep the same artwork variant on a card as it moves between hands. */
export interface Card {
  uid: string
  id: CardId
}

// ---------------------------------------------------------------------------
// Players & turns
// ---------------------------------------------------------------------------

export interface Player {
  id: string
  nickname: string
  avatarId: string
  seat: number
  hand: Card[]
  alive: boolean
  connected: boolean
  /** Epoch ms of the disconnect, for the reconnect grace period. */
  disconnectedAt: number | null
  /** Confirmed "return to the waiting room" after a finished game. Reset on start-game. */
  ready: boolean
}

export interface TurnState {
  seat: number
  direction: 1 | -1
  /** Turns the current player still owes, including the one in progress. */
  turnsRemaining: number
}

// ---------------------------------------------------------------------------
// Interactions — declarative prompts, so new card types need no new UI code
// ---------------------------------------------------------------------------

export type InteractionKind =
  | 'choose-card-from-hand'
  | 'choose-deck-position'
  | 'reorder-cards'
  | 'choose-from-discard'
  | 'simultaneous-choose-card'

export interface PendingInteraction {
  id: string
  kind: InteractionKind
  /** Card definition that owns this prompt; used to route the response back. */
  cardId: CardId
  /** Who must answer. Everyone else waits. */
  requiredFrom: string[]
  responses: Record<string, InteractionResponse>
  /** Free-form, card-specific continuation data (target ids, drawn card, ...). */
  context: Record<string, unknown>
  prompt: string
  /** Cards to show in the prompt. Only sent to players in `requiredFrom`. */
  cards?: Card[]
  /** Upper bound for `choose-deck-position` (draw pile size). */
  maxPosition?: number
  deadline: number
}

export type InteractionResponse =
  | { type: 'card'; uid: string }
  | { type: 'position'; index: number }
  | { type: 'order'; uids: string[] }

// ---------------------------------------------------------------------------
// The action stack (play + Nope chain)
// ---------------------------------------------------------------------------

export type ComboKind = 'pair' | 'triple' | 'five-different'

export interface PendingAction {
  id: string
  playerId: string
  /** Card that defines the behaviour. For combos this is the cat card played. */
  cardId: CardId
  /** Cards spent on this action (already moved to the discard pile). */
  cardUids: string[]
  combo: ComboKind | null
  targetPlayerId: string | null
  /** Card type demanded by a three-of-a-kind combo. */
  namedCardId: CardId | null
  nopeable: boolean
}

export interface NopeWindow {
  /** Epoch ms. Broadcast as an absolute deadline so clocks need not agree. */
  deadline: number
  /** Players who explicitly passed; the window closes early once all have. */
  passed: string[]
}

// ---------------------------------------------------------------------------
// Events — an append-only log the client replays as animation + text
// ---------------------------------------------------------------------------

export interface GameEvent {
  seq: number
  at: number
  type:
    | 'game-started'
    | 'card-played'
    | 'combo-played'
    | 'action-noped'
    | 'action-resolved'
    | 'card-drawn'
    | 'card-stolen'
    | 'card-given'
    | 'card-demanded'
    | 'card-taken-from-discard'
    | 'deck-shuffled'
    | 'future-seen'
    | 'future-altered'
    | 'garbage-collected'
    | 'kitten-drawn'
    | 'kitten-defused'
    | 'player-exploded'
    | 'turn-changed'
    | 'player-attacked'
    | 'direction-reversed'
    | 'game-over'
    | 'returned-to-lobby'
  playerId?: string
  targetId?: string
  cardId?: CardId
  cardIds?: CardId[]
  count?: number
  message: string
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type GameStatus = 'lobby' | 'playing' | 'over'

export const STATE_VERSION = 4

export interface GameState {
  version: number
  roomId: string
  status: GameStatus
  /** mulberry32 state. Persisting it keeps the game deterministic + replayable. */
  rngState: number
  seed: number
  /** Host-pinned card counts. Survives `resetToLobby`, so it holds for every
   *  game played in this room. Empty means "scale everything by player count". */
  deckOverrides: DeckOverrides
  players: Player[]
  /** Index 0 is the TOP of the draw pile. */
  drawPile: Card[]
  /** Index 0 is the TOP of the discard pile. */
  discardPile: Card[]
  turn: TurnState
  actionStack: PendingAction[]
  nopeWindow: NopeWindow | null
  interaction: PendingInteraction | null
  /** Private See the Future / Alter the Future results, per player. */
  peeks: Record<string, Card[]>
  /** Cards temporarily out of every pile, e.g. a kitten awaiting reinsertion. */
  limbo: Card[]
  turnDeadline: number | null
  winnerId: string | null
  eventSeq: number
  log: GameEvent[]
}

// ---------------------------------------------------------------------------
// Commands — the only way to mutate state
// ---------------------------------------------------------------------------

export type Command =
  | { type: 'start-game'; playerId: string; now: number }
  | { type: 'set-deck-overrides'; playerId: string; overrides: DeckOverrides; now: number }
  | {
      type: 'play-card'
      playerId: string
      uids: string[]
      combo: ComboKind | null
      targetPlayerId?: string
      namedCardId?: CardId
      now: number
    }
  | { type: 'draw-card'; playerId: string; now: number }
  | { type: 'pass-nope'; playerId: string; now: number }
  | { type: 'submit-interaction'; playerId: string; interactionId: string; response: InteractionResponse; now: number }
  | { type: 'close-nope-window'; now: number }
  | { type: 'timeout-turn'; now: number }
  | { type: 'timeout-interaction'; now: number }
  | { type: 'quit-game'; playerId: string; now: number }
  | { type: 'return-to-lobby'; playerId: string; now: number }

// ---------------------------------------------------------------------------
// Redacted view sent to clients
// ---------------------------------------------------------------------------

export interface PublicPlayer {
  id: string
  nickname: string
  avatarId: string
  seat: number
  handCount: number
  alive: boolean
  connected: boolean
  ready: boolean
}

export interface PublicGameState {
  roomId: string
  status: GameStatus
  players: PublicPlayer[]
  /** Only ever a count — the client never receives draw pile contents. */
  drawCount: number
  discardTop: Card | null
  discardCount: number
  /** Full discard pile: public information in the physical game. */
  discardPile: Card[]
  turn: TurnState
  /** Composition of the next game, already resolved for the current roster.
   *  Public information — the waiting room shows it to everyone. */
  deck: {
    /** Counts that will actually be used. */
    counts: Record<CardId, number>
    /** Which cards the host pinned by hand, so the UI can flag them. */
    overrides: DeckOverrides
    /** Random cards dealt per player; each also gets one guaranteed Defuse. */
    handSize: number
    /** Every card in the game, kittens and defuses included. */
    total: number
  }
  currentPlayerId: string | null
  actionStack: PendingAction[]
  nopeWindow: NopeWindow | null
  /** Redacted: `cards` present only when this player must answer, and neither
   *  `context` (holds the kitten's uid) nor raw `responses` ever ship. */
  interaction:
    | (Omit<PendingInteraction, 'cards' | 'context' | 'responses'> & {
        cards?: Card[]
        isForYou: boolean
        /** Who has answered already, for the "waiting for ..." indicator. */
        answered: string[]
      })
    | null
  turnDeadline: number | null
  winnerId: string | null
  /** This player's own private data. */
  you: {
    id: string
    hand: Card[]
    peek: Card[] | null
    isHost: boolean
  } | null
  log: GameEvent[]
}
