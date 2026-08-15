import {
  ALL_CARD_IDS,
  CARD_CATALOG,
  DECK_COUNT_MAX,
  HAND_SIZE,
  type Card,
  type CardId,
  type DeckOverrides,
} from '#shared/types/game'
import { shuffle, type RngHolder } from './rng'

/**
 * Deck composition scales with the player count so a 2-player and a 10-player
 * game both feel right. Every count comes from catalog.json:
 *
 *   - Exploding Kittens: players - 1  (exactly one survivor)
 *   - Defuse:            players + max(1, round(players / 4))
 *                        (1 dealt to each player, the rest shuffled into the deck)
 *   - everything else:   round(base * players / 5), clamped to `min` (default 1)
 *
 * Every one of those is only a *default*: the room host can pin any card to an
 * absolute count from the waiting room, and that number is used verbatim
 * regardless of player count. Cards the host never touched keep scaling.
 *
 * Adding a card type is a catalog.json edit — nothing here changes.
 */

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 10

const NO_OVERRIDES: DeckOverrides = {}

export function explodingKittenCount(players: number, overrides: DeckOverrides = NO_OVERRIDES): number {
  return overrides['exploding-kitten'] ?? Math.max(1, players - 1)
}

export function defuseCount(players: number, overrides: DeckOverrides = NO_OVERRIDES): number {
  return overrides.defuse ?? players + Math.max(1, Math.round(players / 4))
}

export function cardCount(id: CardId, players: number, overrides: DeckOverrides = NO_OVERRIDES): number {
  const entry = CARD_CATALOG.find((c) => c.id === id)
  if (!entry) throw new Error(`Unknown card id: ${id}`)
  const pinned = overrides[id]
  if (pinned != null) return pinned
  const { deck } = entry
  if (deck.formula === 'players-minus-1') return explodingKittenCount(players, overrides)
  if (deck.formula === 'defuse') return defuseCount(players, overrides)
  const base = deck.base ?? 0
  return Math.max(deck.min ?? 1, Math.round((base * players) / 5))
}

/** Full composition of a game at this player count, including kittens/defuses. */
export function deckComposition(players: number, overrides: DeckOverrides = NO_OVERRIDES): Record<CardId, number> {
  const out = {} as Record<CardId, number>
  for (const entry of CARD_CATALOG) out[entry.id] = cardCount(entry.id, players, overrides)
  return out
}

/**
 * Rejects an override map that is not made of sane numbers. Deliberately does
 * *not* police balance: zero Exploding Kittens or fewer Defuses than players is
 * the host's call, and both are survivable (`settle()` reshuffles the discard
 * pile if the draw pile ever empties, and every player is dealt a Defuse
 * regardless of the pool size).
 */
export function validateDeckOverrides(overrides: DeckOverrides): string | undefined {
  for (const [id, count] of Object.entries(overrides)) {
    if (!ALL_CARD_IDS.includes(id as CardId)) return `Không có lá bài nào tên "${id}".`
    if (typeof count !== 'number' || !Number.isInteger(count)) {
      return 'Số lượng bài phải là số nguyên.'
    }
    if (count < 0 || count > DECK_COUNT_MAX) {
      return `Số lượng mỗi loại bài phải nằm trong khoảng 0–${DECK_COUNT_MAX}.`
    }
  }
  return undefined
}

/** Cards available to deal opening hands from — kittens and defuses excluded. */
export function dealableCount(players: number, overrides: DeckOverrides = NO_OVERRIDES): number {
  let total = 0
  for (const entry of CARD_CATALOG) {
    if (entry.deck.formula) continue
    total += cardCount(entry.id, players, overrides)
  }
  return total
}

/** Blocks a start that could not physically deal everyone an opening hand. */
export function validateDealable(players: number, overrides: DeckOverrides = NO_OVERRIDES): string | undefined {
  const needed = players * HAND_SIZE
  if (dealableCount(players, overrides) < needed) {
    return `Bộ bài không đủ để chia — cần ít nhất ${needed} lá (chưa tính Mèo nổ và Gỡ bom).`
  }
  return undefined
}

let uidCounter = 0

/**
 * Card uids only ever need to be unique within one room's state, so a process
 * counter is enough. The `k-` prefix and fixed width keep a uid from ever
 * being a substring of an unrelated JSON key — `c` + base36 once produced the
 * uid `con`, which matched inside `"connected"` and made a leak check lie.
 */
export function makeCard(id: CardId): Card {
  uidCounter += 1
  return { uid: `k-${uidCounter.toString(36).padStart(5, '0')}`, id }
}

/** Reset between tests so uids stay short and predictable. */
export function resetCardUids(): void {
  uidCounter = 0
}

export interface BuiltDeck {
  /** Cards to deal out and then form the draw pile from. */
  drawPile: Card[]
  /** One Defuse per player, dealt on top of the opening hand. */
  defusesForPlayers: Card[]
}

/**
 * Builds the deck the way the rulebook sets one up: kittens and defuses are
 * held back, the rest is shuffled and dealt, then the held-back cards go in.
 * `dealFrom` returns the pile to deal opening hands from; the caller inserts
 * the remainder afterwards via `finishDeck`.
 */
export function buildDealPile(rng: RngHolder, players: number, overrides: DeckOverrides = NO_OVERRIDES): Card[] {
  const pile: Card[] = []
  for (const entry of CARD_CATALOG) {
    // Held back by catalog category, not by count: an override changes how many
    // kittens/defuses exist, never whether they are dealt into opening hands.
    if (entry.deck.formula) continue
    const n = cardCount(entry.id, players, overrides)
    for (let i = 0; i < n; i++) pile.push(makeCard(entry.id))
  }
  return shuffle(rng, pile)
}

/** Shuffles the leftover Defuses and the Exploding Kittens back into the deck. */
export function finishDeck(
  rng: RngHolder,
  remaining: Card[],
  players: number,
  dealtDefuses: number,
  overrides: DeckOverrides = NO_OVERRIDES,
): Card[] {
  const extras: Card[] = []
  // Clamped: a host may set fewer Defuses than players, and each player is
  // still dealt one, which just leaves nothing spare for the draw pile.
  const leftoverDefuse = Math.max(0, defuseCount(players, overrides) - dealtDefuses)
  for (let i = 0; i < leftoverDefuse; i++) extras.push(makeCard('defuse'))
  for (let i = 0; i < explodingKittenCount(players, overrides); i++) extras.push(makeCard('exploding-kitten'))
  return shuffle(rng, [...remaining, ...extras])
}
