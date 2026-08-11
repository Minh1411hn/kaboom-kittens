import type { CardDefinition } from '../registry'

/**
 * Every player with cards puts 1 card face down into a pile; the pile is
 * shuffled and dealt back out one at a time, starting with the player who
 * played the card. Everyone answers at once, so this is the only
 * `simultaneous-choose-card` prompt in the game.
 */
export const garbageCollection: CardDefinition = {
  id: 'garbage-collection',
  playWindow: 'own-turn',
  nopeable: true,

  resolve: ({ player }) => [{ t: 'GARBAGE_COLLECT', starterId: player.id }],

  onInteractionComplete: ({ interaction }) => {
    const starterId = interaction.context.starterId as string
    const picks = interaction.requiredFrom
      .map((playerId) => ({ playerId, response: interaction.responses[playerId] }))
      .filter((entry) => entry.response?.type === 'card')
      .map((entry) => ({ playerId: entry.playerId, uid: (entry.response as { uid: string }).uid }))

    if (!picks.length) return []
    return [{ t: 'GARBAGE_REDISTRIBUTE', starterId, picks }]
  },
}
