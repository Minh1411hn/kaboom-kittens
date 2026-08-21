import {
  type CardId,
  type ComboKind,
  type GameState,
  type Player,
} from '#shared/types/game'
import type { Rejection } from '#shared/types/errors'
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
    canPlay: () => ({ code: 'cat-solo-not-allowed' }),
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
): true | Rejection {
  const target = targetPlayerId ? playerById(state, targetPlayerId) : undefined

  if (combo === 'five-different') {
    if (ids.length !== 5) return { code: 'five-combo-wrong-count' }
    if (new Set(ids).size !== 5) return { code: 'five-combo-mismatch' }
    if (!state.discardPile.length) return { code: 'discard-empty' }
    return true
  }

  const needed = combo === 'pair' ? 2 : 3
  if (ids.length !== needed) return { code: 'combo-wrong-count', params: { needed } }
  if (!isMatchingCatSet(ids)) return { code: 'cat-combo-mismatch' }
  if (!target || !target.alive) return { code: 'invalid-target' }
  if (target.id === player.id) return { code: 'cant-target-self' }
  if (!target.hand.length) return { code: 'target-empty-handed', params: { name: target.nickname } }
  if (combo === 'triple' && !namedCardId) return { code: 'named-card-required' }
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
          combo: 'triple',
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
