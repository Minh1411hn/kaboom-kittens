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
    if (!top) return 'Hiện tại không có hành động nào để Nope.'
    if (!top.nopeable) return 'Hành động đó không thể bị Nope.'
    if (top.playerId === player.id) return 'Bạn không thể tự Nope lá bài của chính mình.'
    return true
  },

  resolve: () => [],
}
