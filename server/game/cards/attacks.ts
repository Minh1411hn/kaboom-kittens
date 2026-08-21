import type { CardDefinition } from '../registry'
import { playerById } from '../turn'

/**
 * Attack semantics, per the Imploding Kittens rules:
 *
 *   Attack ends ALL of your remaining turns without drawing and forces the
 *   victim to take two turns — plus any turns you were still carrying from an
 *   Attack of your own. So the chain runs 2, 4, 6, 8 as it goes round.
 *
 * A player on a plain single turn is carrying nothing, hence the `> 1` guard:
 * they pass on the base 2 rather than 3.
 *
 * Personal Attack is the odd one out — it keeps the turn with you.
 */
export function attackTurns(turnsRemaining: number): number {
  return (turnsRemaining > 1 ? turnsRemaining : 0) + 2
}

export const attack2x: CardDefinition = {
  id: 'attack-2x',
  playWindow: 'own-turn',
  nopeable: true,
  resolve: ({ state }) => [
    { t: 'PASS_TURNS', toPlayerId: null, turns: attackTurns(state.turn.turnsRemaining) },
  ],
}

export const targetedAttack2x: CardDefinition = {
  id: 'targeted-attack-2x',
  playWindow: 'own-turn',
  nopeable: true,
  requiresTarget: true,
  canPlay: ({ state, player, action }) => {
    const target = action.targetPlayerId ? playerById(state, action.targetPlayerId) : undefined
    if (!target || !target.alive) return { code: 'invalid-target' }
    if (target.id === player.id) return { code: 'cant-target-self' }
    return true
  },
  resolve: ({ state, action }) => [
    { t: 'PASS_TURNS', toPlayerId: action.targetPlayerId, turns: attackTurns(state.turn.turnsRemaining) },
  ],
}

export const personalAttack3x: CardDefinition = {
  id: 'personal-attack-3x',
  playWindow: 'own-turn',
  nopeable: true,
  /** End the current turn without drawing, then take 3 turns yourself. */
  resolve: () => [{ t: 'SET_TURNS', turns: 3 }],
}
