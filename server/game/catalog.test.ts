import { describe, expect, it } from 'vitest'
import { ALL_CARD_IDS, CARD_BY_ID, assertCatalogMatchesUnion } from '#shared/types/game'
import { registerAllCards } from './cards'
import { getCardDefinition } from './registry'

registerAllCards()

/**
 * The client greys out cards using the `play` hints in catalog.json, while the
 * server enforces the real rules from the registry. These tests keep the two
 * from drifting — a mismatch would show a card as playable and then reject it.
 */
describe('catalog and registry stay in sync', () => {
  it('covers exactly the CardId union', () => {
    expect(() => assertCatalogMatchesUnion()).not.toThrow()
  })

  it('every card has a definition and artwork metadata', () => {
    for (const id of ALL_CARD_IDS) {
      expect(() => getCardDefinition(id)).not.toThrow()
      const entry = CARD_BY_ID[id]
      expect(entry.name.length).toBeGreaterThan(0)
      expect(entry.text.length).toBeGreaterThan(0)
      expect(entry.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('agrees on which cards need a target', () => {
    for (const id of ALL_CARD_IDS) {
      expect([id, CARD_BY_ID[id].play.target ?? false]).toEqual([
        id,
        getCardDefinition(id).requiresTarget ?? false,
      ])
    }
  })

  it('agrees on which cards are playable out of turn', () => {
    for (const id of ALL_CARD_IDS) {
      expect([id, CARD_BY_ID[id].play.anytime ?? false]).toEqual([
        id,
        getCardDefinition(id).playWindow === 'anytime',
      ])
    }
  })

  it('marks exactly the cards that cannot be played on their own', () => {
    const notSolo = ALL_CARD_IDS.filter((id) => !CARD_BY_ID[id].play.solo)
    expect(notSolo.sort()).toEqual(
      [
        'exploding-kitten',
        'defuse',
        'tacocat',
        'cattermelon',
        'hairy-potato-cat',
        'rainbow-ralphing-cat',
        'beard-cat',
        'feral-cat',
      ].sort(),
    )
    // And each of those really does refuse a solo play in the engine.
    for (const id of notSolo) {
      const definition = getCardDefinition(id)
      expect(typeof definition.canPlay?.({} as never)).toBe('string')
    }
  })
})
