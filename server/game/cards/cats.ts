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
    canPlay: () => 'Cat Cards only work in a combo of 2, 3 or 5 cards.',
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
    if (ids.length !== 5) return 'A five-card combo needs exactly 5 cards.'
    if (new Set(ids).size !== 5) return 'All 5 cards must be different types.'
    if (!state.discardPile.length) return 'The discard pile is empty.'
    return true
  }

  const needed = combo === 'pair' ? 2 : 3
  if (ids.length !== needed) return `That combo needs exactly ${needed} cards.`
  if (!isMatchingCatSet(ids)) return 'Those cards do not match. Feral Cat can stand in for any Cat Card.'
  if (!target || !target.alive) return 'Pick a player who is still in the game.'
  if (target.id === player.id) return 'You cannot target yourself.'
  if (!target.hand.length) return `${target.nickname} has no cards.`
  if (combo === 'triple' && !namedCardId) return 'Name the card you are demanding.'
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
          message: `${player.nickname} demanded a ${CARD_BY_ID[action.namedCardId].name} from ${target.nickname}.`,
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
            prompt: 'Take any card from the discard pile',
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
