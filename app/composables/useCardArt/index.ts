import manifest from '#shared/generated/card-art.json'
import { CARD_BY_ID, CARD_CATALOG, type CardId } from '#shared/types/game'

const art = manifest as Record<string, string[]>
const FALLBACK = '/cards/card-back/artworks/Cardback.png'

/** The artwork folder a card reads from — its own id unless it shares a pool. */
function artSlug(cardId: CardId | 'card-back'): string {
  return CARD_BY_ID[cardId as CardId]?.art ?? cardId
}

/**
 * Where a card sits in a pool it shares with other cards. The five named cat
 * cards all point at `normal-cat`, so each one takes a different picture out of
 * that folder by catalog order — two Tacocats always look alike, and a Tacocat
 * never looks like a Cattermelon.
 *
 * This matches by POSITION, not by name, so a shared pool's files must be named
 * `<NN>-<card id>.png` and numbered in catalog order. That convention is the
 * only thing tying a picture to the card it depicts: the folder once held ten
 * artworks in an unrelated order, and four of the five cats rendered a
 * different card's face — printed title and all — for as long as it did.
 * `useCardArt.test.ts` fails if the two orders ever drift apart again.
 */
const sharedSlot = new Map<CardId, number>()
for (const entry of CARD_CATALOG) {
  const peers = CARD_CATALOG.filter((c) => (c.art ?? c.id) === (entry.art ?? entry.id))
  if (peers.length > 1) sharedSlot.set(entry.id, peers.indexOf(entry))
}

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
 * Picks one of the artwork variants in `public/cards/<slug>/artworks/`. A card
 * with its own folder is keyed by uid rather than at random, so it does not
 * change its face as it moves between hands — and every client shows the same
 * one. A card sharing a folder ignores the uid instead: its slot in the pool is
 * its identity, which is what makes a pair of cats recognisable as a pair.
 */
export function cardArtUrl(cardId: CardId | 'card-back', uid?: string): string {
  const variants = art[artSlug(cardId)]
  if (!variants?.length) return art['card-back']?.[0] ?? FALLBACK

  const slot = sharedSlot.get(cardId as CardId)
  if (slot !== undefined) return variants[slot % variants.length]!

  if (variants.length === 1 || !uid) return variants[0]!
  return variants[hash(`${cardId}:${uid}`) % variants.length]!
}

export function cardBackUrl(): string {
  return art['card-back']?.[0] ?? FALLBACK
}

/**
 * Card name/label/rules text, localized. `catalog.json`'s own `name`/`label`/
 * `text` fields are frozen Vietnamese and only still read server-side (until
 * they are dropped for good once nothing depends on them there) — every
 * display in `app/` goes through this instead, keyed by `CardId` under the
 * `cards.*` namespace in `i18n/locales/*.json`.
 */
export function useCardText() {
  const { t } = useI18n()
  return {
    cardName: (cardId: CardId): string => t(`cards.${cardId}.name`),
    cardLabel: (cardId: CardId): string => t(`cards.${cardId}.label`),
    cardText: (cardId: CardId): string => t(`cards.${cardId}.text`),
  }
}
