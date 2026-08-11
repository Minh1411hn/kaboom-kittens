import { isCatCard, type CardId, type ComboKind } from '../types/game'

/**
 * Combo shape rules, shared by the client (to enable the Play button) and the
 * server (to enforce it). Keeping one copy is what stops the UI from offering
 * a combo the engine will reject.
 */

/**
 * Feral Cat stands in for any Cat Card, so a set matches when every card is a
 * cat and the non-Feral ids are all the same. Two Feral Cats match each other.
 */
export function isMatchingCatSet(ids: CardId[]): boolean {
  if (!ids.length || !ids.every(isCatCard)) return false
  const specific = new Set(ids.filter((id) => id !== 'feral-cat'))
  return specific.size <= 1
}

/** The combo these cards would form, or null if they form none. */
export function comboFor(ids: CardId[]): ComboKind | null {
  if (ids.length === 2 && isMatchingCatSet(ids)) return 'pair'
  if (ids.length === 3 && isMatchingCatSet(ids)) return 'triple'
  if (ids.length === 5 && new Set(ids).size === 5) return 'five-different'
  return null
}
