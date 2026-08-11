import type { CardDefinition } from '../registry'
import type { Effect } from '../effects'

/**
 * Cards whose whole behaviour is a couple of Effects. Anything that needs a
 * prompt, a target or turn arithmetic beyond one line lives in its own file.
 */

export const skip: CardDefinition = {
  id: 'skip',
  playWindow: 'own-turn',
  nopeable: true,
  resolve: () => [{ t: 'END_TURN' }],
}

export const shuffleCard: CardDefinition = {
  id: 'shuffle',
  playWindow: 'own-turn',
  nopeable: true,
  resolve: () => [{ t: 'SHUFFLE_DRAW' }],
}

export const drawFromTheBottom: CardDefinition = {
  id: 'draw-from-the-bottom',
  playWindow: 'own-turn',
  nopeable: true,
  // DRAW ends the turn itself (and handles kittens), so no END_TURN here.
  resolve: ({ player }) => [{ t: 'DRAW', playerId: player.id, from: 'bottom' }],
}

export const reverse: CardDefinition = {
  id: 'reverse',
  playWindow: 'own-turn',
  nopeable: true,
  /**
   * Flip direction, then end one turn without drawing. With two players alive
   * this naturally behaves as a Skip: either direction hands over to the
   * only other player.
   */
  resolve: (): Effect[] => [{ t: 'REVERSE' }, { t: 'END_TURN' }],
}

const seeTheFuture = (id: 'see-the-future-3x' | 'see-the-future-5x', count: number): CardDefinition => ({
  id,
  playWindow: 'own-turn',
  nopeable: true,
  resolve: ({ player }) => [{ t: 'PEEK', playerId: player.id, count }],
})

export const seeTheFuture3x = seeTheFuture('see-the-future-3x', 3)
export const seeTheFuture5x = seeTheFuture('see-the-future-5x', 5)
