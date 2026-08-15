// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { CARD_CATALOG, type CardId } from '#shared/types/game'
import { cardArtUrl } from './useCardArt'

/**
 * A card sharing an art pool gets its picture by *position* — its index among
 * the pool's peers in catalog order, against the pool's files in natural sort
 * order. Nothing checks that the picture actually depicts that card, and it
 * silently did not: every named cat but Beard Cat once rendered a different
 * card's face, because the folder held ten artworks in an unrelated order.
 *
 * The fix is the naming convention these tests pin down: a shared pool's files
 * are named `<NN>-<card id>.png`, numbered in catalog order. Adding a cat, or
 * dropping a file into the folder, now fails here instead of quietly shifting
 * four cards onto the wrong faces.
 */
describe('shared artwork pools', () => {
  const shared = CARD_CATALOG.filter((entry) => entry.art)

  it('covers every card that shares a pool', () => {
    // Guards the tests below against silently becoming vacuous.
    expect(shared.map((e) => e.id)).toEqual([
      'tacocat',
      'cattermelon',
      'hairy-potato-cat',
      'rainbow-ralphing-cat',
      'beard-cat',
    ])
  })

  it('gives each card the artwork file named after it', () => {
    for (const entry of shared) {
      expect(cardArtUrl(entry.id)).toContain(`-${entry.id}.png`)
    }
  })

  it('never hands two cards in a pool the same picture', () => {
    const urls = shared.map((entry) => cardArtUrl(entry.id))
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('ignores the uid, so every copy of a cat looks like its pair', () => {
    // What makes a pair recognisable as a pair on the table.
    const id: CardId = 'tacocat'
    expect(cardArtUrl(id, 'k-00001')).toBe(cardArtUrl(id, 'k-99999'))
  })
})
