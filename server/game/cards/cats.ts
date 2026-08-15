import {
  CARD_BY_ID,
  type CardId,
  type ComboKind,
  type GameState,
  type Player,
} from '#shared/types/game'
import { isMatchingCatSet } from '#shared/cards/rules'
import type { Effect } from '../effects'
import type { CardDefinition, InteractionContext, ResolveContext } from '../registry'
import { playerById } from '../turn'

const CAT_IDS: CardId[] = [
  'tacocat',
  'cattermelon',
  'hairy-potato-cat',
  'rainbow-ralphing-cat',
  'beard-cat',
  'feral-cat',
]

/** Cat cards do nothing alone — they exist to be combined. */
function catCard(id: CardId): CardDefinition {
  return {
    id,
    playWindow: 'own-turn',
    nopeable: true,
    canPlay: () => 'Các lá bài Mèo chỉ có tác dụng khi kết hợp thành combo 2, 3 hoặc 5 lá bài.',
    resolve: () => [],
  }
}

export const catCards: CardDefinition[] = CAT_IDS.map(catCard)

// ---------------------------------------------------------------------------
// Combos
// ---------------------------------------------------------------------------

export function validateCombo(
  combo: ComboKind,
  ids: CardId[],
  state: GameState,
  player: Player,
  targetPlayerId: string | null,
  namedCardId: CardId | null,
): true | string {
  const target = targetPlayerId ? playerById(state, targetPlayerId) : undefined

  if (combo === 'five-different') {
    if (ids.length !== 5) return 'Combo 5 lá cần chính xác 5 lá bài.'
    if (new Set(ids).size !== 5) return 'Cả 5 lá bài phải thuộc 5 loại khác nhau.'
    if (!state.discardPile.length) return 'Chồng bài đã đánh đang trống.'
    return true
  }

  const needed = combo === 'pair' ? 2 : 3
  if (ids.length !== needed) return `Combo đó cần chính xác ${needed} lá bài.`
  if (!isMatchingCatSet(ids)) return 'Các lá bài không khớp nhau. Feral Cat có thể dùng để thay thế cho lá Mèo bất kỳ.'
  if (!target || !target.alive) return 'Hãy chọn một người chơi vẫn còn trong ván.'
  if (target.id === player.id) return 'Bạn không thể chọn chính mình.'
  if (!target.hand.length) return `${target.nickname} không có lá bài nào trên tay.`
  if (combo === 'triple' && !namedCardId) return 'Hãy chỉ định lá bài bạn muốn đòi.'
  return true
}

/** Combos bypass the per-card `resolve` and land here instead. */
export function resolveCombo({ state, player, action }: ResolveContext): Effect[] {
  const targetId = action.targetPlayerId
  const target = targetId ? playerById(state, targetId) : undefined

  switch (action.combo) {
    case 'pair':
      if (!target || !target.hand.length) return []
      return [{ t: 'STEAL_RANDOM', fromPlayerId: target.id, toPlayerId: player.id }]

    case 'triple': {
      if (!target || !action.namedCardId) return []
      return [
        {
          t: 'LOG',
          type: 'combo-played',
          playerId: player.id,
          targetId: target.id,
          cardId: action.namedCardId,
          message: `${player.nickname} đã đòi 1 lá ${CARD_BY_ID[action.namedCardId].name} từ ${target.nickname}.`,
        },
        { t: 'DEMAND', fromPlayerId: target.id, toPlayerId: player.id, cardId: action.namedCardId },
      ]
    }

    case 'five-different': {
      if (!state.discardPile.length) return []
      return [
        {
          t: 'REQUEST_INTERACTION',
          interaction: {
            kind: 'choose-from-discard',
            cardId: action.cardId,
            requiredFrom: [player.id],
            context: { combo: 'five-different' },
            prompt: 'Lấy 1 lá bài bất kỳ từ chồng bài đã đánh',
            cards: state.discardPile.map((c) => ({ ...c })),
          },
        },
      ]
    }

    default:
      return []
  }
}

/** Interaction router sends `context.combo` prompts here instead of to a card. */
export function resolveComboInteraction({ interaction }: InteractionContext): Effect[] {
  if (interaction.context.combo !== 'five-different') return []
  const responderId = interaction.requiredFrom[0]
  const response = responderId ? interaction.responses[responderId] : undefined
  if (!responderId || !response || response.type !== 'card') return []
  return [{ t: 'TAKE_FROM_DISCARD', playerId: responderId, uid: response.uid }]
}
