import type { CardDefinition } from '../registry'

/**
 * Peek at the top N and put them back in an order of your choosing. The peek
 * is private, so the cards ride along inside the interaction (which only the
 * asking player receives) rather than in the broadcast state.
 */
function alterTheFuture(id: 'alter-the-future-3x' | 'alter-the-future-5x', count: number): CardDefinition {
  return {
    id,
    playWindow: 'own-turn',
    nopeable: true,

    canPlay: ({ state }) => (state.drawPile.length ? true : { code: 'draw-pile-empty' }),

    resolve: ({ state, player }) => {
      const top = state.drawPile.slice(0, count)
      if (!top.length) return []
      return [
        {
          t: 'REQUEST_INTERACTION',
          interaction: {
            kind: 'reorder-cards',
            cardId: id,
            requiredFrom: [player.id],
            context: {},
            cards: top.map((c) => ({ ...c })),
          },
        },
      ]
    },

    onInteractionComplete: ({ interaction }) => {
      const responderId = interaction.requiredFrom[0]
      const response = responderId ? interaction.responses[responderId] : undefined
      if (!response || response.type !== 'order') return []
      return [{ t: 'SET_DRAW_TOP', uids: response.uids }]
    },
  }
}

export const alterTheFuture3x = alterTheFuture('alter-the-future-3x', 3)
export const alterTheFuture5x = alterTheFuture('alter-the-future-5x', 5)
