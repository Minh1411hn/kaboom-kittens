import manifest from '#shared/generated/card-art.json'
import { CARD_BY_ID, type CardId } from '#shared/types/game'

const art = manifest as Record<string, string[]>
const FALLBACK = '/cards/card-back/1.svg'

/** Stable string hash, so a card keeps the same face for the whole game. */
function hash(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Picks one of the artwork variants in `public/cards/<id>/`. Keyed by the
 * card's uid rather than at random, so a card does not change its face as it
 * moves between hands — and every client shows the same one.
 */
export function cardArtUrl(cardId: CardId | 'card-back', uid?: string): string {
  const variants = art[cardId]
  if (!variants?.length) return art['card-back']?.[0] ?? FALLBACK
  if (variants.length === 1 || !uid) return variants[0]!
  return variants[hash(`${cardId}:${uid}`) % variants.length]!
}

export function cardBackUrl(): string {
  return art['card-back']?.[0] ?? FALLBACK
}

export function cardName(cardId: CardId): string {
  return CARD_BY_ID[cardId]?.name ?? cardId
}

export function cardText(cardId: CardId): string {
  return CARD_BY_ID[cardId]?.text ?? ''
}

/** How many artwork variants exist, for the debug/gallery page. */
export function artVariantCount(cardId: CardId | 'card-back'): number {
  return art[cardId]?.length ?? 0
}
