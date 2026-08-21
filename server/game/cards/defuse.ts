import type { CardDefinition } from '../registry'
import type { Effect } from '../effects'

/**
 * Defuse is never played from the hand — the DRAW effect spends it
 * automatically when a kitten comes up, then opens this prompt so the drawer
 * can secretly choose where the kitten goes back. It is registered so the
 * interaction router can find its `onInteractionComplete`, and it is not
 * nopeable.
 */
export const defuse: CardDefinition = {
  id: 'defuse',
  playWindow: 'own-turn',
  nopeable: false,
  canPlay: () => ({ code: 'defuse-auto-only' }),
  resolve: () => [],

  onInteractionComplete: ({ interaction }): Effect[] => {
    const kittenUid = interaction.context.kittenUid as string
    const responderId = interaction.requiredFrom[0]
    const response = responderId ? interaction.responses[responderId] : undefined
    const index = response && response.type === 'position' ? response.index : 0
    return [
      { t: 'INSERT_FROM_LIMBO', uid: kittenUid, index },
      // The kitten draw consumed this turn; it ends now that the card is back.
      { t: 'END_TURN' },
    ]
  },
}

/**
 * Exploding Kitten has no play behaviour — it detonates on draw — but it is
 * registered so `assertRegistryComplete()` covers the whole catalog.
 */
export const explodingKitten: CardDefinition = {
  id: 'exploding-kitten',
  playWindow: 'own-turn',
  nopeable: false,
  canPlay: () => ({ code: 'cant-play-kitten' }),
  resolve: () => [],
}
