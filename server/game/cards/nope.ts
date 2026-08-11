import type { CardDefinition } from '../registry'

/**
 * Nope is playable by anyone, at any time, against the top of the action
 * stack. It never `resolve()`s on its own — `nope.ts` in the engine counts the
 * Nopes stacked above the base action and cancels it when that count is odd.
 * A Nope is itself nopeable, which is what makes Nope/Yup chains work.
 */
export const nope: CardDefinition = {
  id: 'nope',
  playWindow: 'anytime',
  nopeable: true,

  canPlay: ({ state, player }) => {
    const top = state.actionStack[state.actionStack.length - 1]
    if (!top) return 'There is nothing to Nope right now.'
    if (!top.nopeable) return 'That action cannot be Noped.'
    if (top.playerId === player.id) return 'You cannot Nope your own card.'
    return true
  },

  resolve: () => [],
}
