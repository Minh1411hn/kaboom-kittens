import type { CardDefinition } from '../registry'
import { playerById } from '../turn'

/** Same effect as the pair combo (STEAL_RANDOM), but a solo play instead of a combo. */
export const stealACard: CardDefinition = {
  id: 'steal-a-card',
  playWindow: 'own-turn',
  nopeable: true,
  requiresTarget: true,

  canPlay: ({ state, player, action }) => {
    const target = action.targetPlayerId ? playerById(state, action.targetPlayerId) : undefined
    if (!target || !target.alive) return 'Hãy chọn một người chơi vẫn còn trong ván.'
    if (target.id === player.id) return 'Bạn không thể tự trộm bài của chính mình.'
    if (!target.hand.length) return `${target.nickname} không có lá bài nào trên tay để trộm.`
    return true
  },

  resolve: ({ player, action }) => {
    if (!action.targetPlayerId) return []
    return [{ t: 'STEAL_RANDOM', fromPlayerId: action.targetPlayerId, toPlayerId: player.id }]
  },
}
