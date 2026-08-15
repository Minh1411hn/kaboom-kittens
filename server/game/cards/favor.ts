import type { CardDefinition } from '../registry'
import { playerById } from '../turn'

/** The target chooses which card to hand over, so this needs a prompt. */
export const favor: CardDefinition = {
  id: 'favor',
  playWindow: 'own-turn',
  nopeable: true,
  requiresTarget: true,

  canPlay: ({ state, player, action }) => {
    const target = action.targetPlayerId ? playerById(state, action.targetPlayerId) : undefined
    if (!target || !target.alive) return 'Hãy chọn một người chơi vẫn còn trong ván.'
    if (target.id === player.id) return 'Bạn không thể tự xin viện trợ từ chính mình.'
    if (!target.hand.length) return `${target.nickname} không có lá bài nào trên tay để đưa.`
    return true
  },

  resolve: ({ state, player, action }) => {
    const target = action.targetPlayerId ? playerById(state, action.targetPlayerId) : undefined
    if (!target || !target.hand.length) return []
    return [
      {
        t: 'REQUEST_INTERACTION',
        interaction: {
          kind: 'choose-card-from-hand',
          cardId: 'favor',
          requiredFrom: [target.id],
          context: { toPlayerId: player.id },
          prompt: `Chọn 1 lá bài để đưa cho ${player.nickname}`,
          cards: target.hand.map((c) => ({ ...c })),
        },
      },
    ]
  },

  onInteractionComplete: ({ interaction }) => {
    const giverId = interaction.requiredFrom[0]
    const toPlayerId = interaction.context.toPlayerId as string
    const response = giverId ? interaction.responses[giverId] : undefined
    if (!giverId || !response || response.type !== 'card') return []
    return [{ t: 'MOVE_CARD', uid: response.uid, fromPlayerId: giverId, toPlayerId, reason: 'favor' }]
  },
}
