import { CARD_CATALOG, type Card, type CardId } from '#shared/types/game'
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
 * Adding a card type is a catalog.json edit — nothing here changes.
 */

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 10

export function explodingKittenCount(players: number): number {
  return Math.max(1, players - 1)
}

export function defuseCount(players: number): number {
  return players + Math.max(1, Math.round(players / 4))
}

export function cardCount(id: CardId, players: number): number {
  const entry = CARD_CATALOG.find((c) => c.id === id)
  if (!entry) throw new Error(`Unknown card id: ${id}`)
  const { deck } = entry
  if (deck.formula === 'players-minus-1') return explodingKittenCount(players)
  if (deck.formula === 'defuse') return defuseCount(players)
  const base = deck.base ?? 0
  return Math.max(deck.min ?? 1, Math.round((base * players) / 5))
}

/** Full composition of a game at this player count, including kittens/defuses. */
export function deckComposition(players: number): Record<CardId, number> {
  const out = {} as Record<CardId, number>
  for (const entry of CARD_CATALOG) out[entry.id] = cardCount(entry.id, players)
  return out
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
export function buildDealPile(rng: RngHolder, players: number): Card[] {
  const pile: Card[] = []
  for (const entry of CARD_CATALOG) {
    if (entry.deck.formula) continue // kittens + defuses are held back
    const n = cardCount(entry.id, players)
    for (let i = 0; i < n; i++) pile.push(makeCard(entry.id))
  }
  return shuffle(rng, pile)
}

/** Shuffles the leftover Defuses and the Exploding Kittens back into the deck. */
export function finishDeck(rng: RngHolder, remaining: Card[], players: number, dealtDefuses: number): Card[] {
  const extras: Card[] = []
  const leftoverDefuse = defuseCount(players) - dealtDefuses
  for (let i = 0; i < leftoverDefuse; i++) extras.push(makeCard('defuse'))
  for (let i = 0; i < explodingKittenCount(players); i++) extras.push(makeCard('exploding-kitten'))
  return shuffle(rng, [...remaining, ...extras])
}
