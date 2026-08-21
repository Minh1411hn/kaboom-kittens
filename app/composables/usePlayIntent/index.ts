import { comboFor } from '#shared/cards/rules'
import { CARD_BY_ID, type Card, type ComboKind, type PublicGameState } from '#shared/types/game'

export interface PlayIntent {
  ok: boolean
  /** Why the Play button is disabled, shown as a hint under the hand. */
  reason: string
  combo: ComboKind | null
  needsTarget: boolean
  needsNamedCard: boolean
}

/**
 * Works out what the currently selected cards would do. Purely advisory — the
 * server revalidates everything — but it is what lets the table grey out
 * illegal plays and ask for a target before sending.
 */
export function usePlayIntent(
  selected: Ref<Card[]>,
  state: Ref<PublicGameState | null>,
  isYourTurn: Ref<boolean>,
) {
  const { t } = useI18n()
  const { cardName } = useCardText()

  return computed<PlayIntent>(() => {
    const cards = selected.value
    const none: PlayIntent = {
      ok: false,
      reason: '',
      combo: null,
      needsTarget: false,
      needsNamedCard: false,
    }
    if (!cards.length) return none

    const ids = cards.map((c) => c.id)
    const combo = comboFor(ids)

    if (cards.length === 1) {
      const entry = CARD_BY_ID[ids[0]!]
      if (!entry.play.solo) {
        return { ...none, reason: t('errors.card-combo-only', { card: cardName(entry.id) }) }
      }
      // Nope is the one card playable off-turn, and only into an open window.
      if (entry.play.anytime) {
        const top = state.value?.actionStack.at(-1)
        if (!top) return { ...none, reason: t('errors.nope-nothing-to-nope') }
        if (top.playerId === state.value?.you?.id) {
          return { ...none, reason: t('errors.nope-self') }
        }
        return { ok: true, reason: '', combo: null, needsTarget: false, needsNamedCard: false }
      }
      if (!isYourTurn.value) return { ...none, reason: t('errors.not-your-turn') }
      return {
        ok: true,
        reason: '',
        combo: null,
        needsTarget: Boolean(entry.play.target),
        needsNamedCard: false,
      }
    }

    if (!combo) {
      if (cards.length === 2 || cards.length === 3) {
        return { ...none, reason: t('errors.cat-combo-mismatch') }
      }
      if (cards.length === 5) return { ...none, reason: t('errors.five-combo-mismatch') }
      return { ...none, reason: t('errors.combo-select-count') }
    }

    if (!isYourTurn.value) return { ...none, reason: t('errors.not-your-turn') }

    if (combo === 'five-different' && !state.value?.discardCount) {
      return { ...none, reason: t('errors.discard-empty') }
    }

    return {
      ok: true,
      reason: '',
      combo,
      needsTarget: combo !== 'five-different',
      needsNamedCard: combo === 'triple',
    }
  })
}
