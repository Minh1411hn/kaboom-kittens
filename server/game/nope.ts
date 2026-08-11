import { CARD_BY_ID, type GameState } from '#shared/types/game'
import { resolveCombo } from './cards/cats'
import { applyEffects, type EffectEnv } from './effects'
import { getCardDefinition } from './registry'
import { logEvent, playerById } from './turn'

/**
 * Players who could still Nope the top of the stack. Used to close the window
 * early: if nobody is holding a Nope there is no reason to make the table wait
 * out the timer, and the outcome is identical because nothing can change hands
 * while a window is open.
 */
export function eligibleNopers(state: GameState): string[] {
  const top = state.actionStack[state.actionStack.length - 1]
  if (!top || !top.nopeable) return []
  return state.players
    .filter((p) => p.alive && p.id !== top.playerId && p.hand.some((c) => c.id === 'nope'))
    .map((p) => p.id)
}

/** Everyone who could Nope has passed (or nobody can) — no need to wait. */
export function windowCanCloseNow(state: GameState): boolean {
  if (!state.nopeWindow) return false
  const eligible = eligibleNopers(state)
  return eligible.every((id) => state.nopeWindow!.passed.includes(id))
}

/**
 * Closes the window and settles the stack. Entry 0 is the action; everything
 * above it is a Nope negating the entry below. An odd number of Nopes cancels
 * the action, an even number lets it through — that is the whole Nope/Yup rule.
 */
export function resolveActionStack(state: GameState, env: EffectEnv): void {
  const stack = state.actionStack
  state.actionStack = []
  state.nopeWindow = null
  if (!stack.length) return

  const base = stack[0]!
  const nopeCount = stack.length - 1
  const player = playerById(state, base.playerId)
  if (!player) return

  if (nopeCount % 2 === 1) {
    logEvent(
      state,
      {
        type: 'action-noped',
        playerId: base.playerId,
        cardId: base.cardId,
        count: nopeCount,
        message:
          nopeCount === 1
            ? `${player.nickname}'s ${CARD_BY_ID[base.cardId].name} was Noped!`
            : `${player.nickname}'s ${CARD_BY_ID[base.cardId].name} was Noped (${nopeCount} Nopes deep)!`,
      },
      env.now,
    )
    return
  }

  if (nopeCount > 0) {
    logEvent(
      state,
      {
        type: 'action-resolved',
        playerId: base.playerId,
        cardId: base.cardId,
        count: nopeCount,
        message: `The Nopes cancelled out — ${CARD_BY_ID[base.cardId].name} goes through!`,
      },
      env.now,
    )
  }

  const ctx = { state, player, action: base, now: env.now }
  const effects = base.combo ? resolveCombo(ctx) : getCardDefinition(base.cardId).resolve(ctx)
  applyEffects(state, effects, env)
}
