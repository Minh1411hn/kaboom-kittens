/**
 * Every reason `server/game/` (or the room service) can refuse a command,
 * as a stable code instead of a finished sentence — `server/game/` must stay
 * pure, so it never resolves text itself. Interpolation values (nicknames,
 * counts) travel in `params` and are substituted client-side via i18n, keyed
 * as `errors.<code>` in `i18n/locales/*.json`.
 */
export type RejectionCode =
  | 'game-already-started'
  | 'room-full'
  | 'game-not-started'
  | 'interaction-in-progress'
  | 'nope-window-open'
  | 'not-your-turn'
  | 'no-nope-window'
  | 'not-in-game'
  | 'already-left'
  | 'game-not-over'
  | 'not-in-lobby'
  | 'min-players'
  | 'deck-not-enough'
  | 'you-are-eliminated'
  | 'no-cards-selected'
  | 'not-your-cards'
  | 'invalid-play-count'
  | 'target-required'
  | 'no-interaction'
  | 'interaction-completed'
  | 'not-your-interaction'
  | 'already-responded'
  | 'choose-a-card'
  | 'not-in-hand'
  | 'not-in-discard'
  | 'choose-a-position'
  | 'invalid-position'
  | 'choose-an-order'
  | 'invalid-order'
  | 'unknown-card'
  | 'count-not-integer'
  | 'count-out-of-range'
  | 'cat-solo-not-allowed'
  | 'five-combo-wrong-count'
  | 'five-combo-mismatch'
  | 'discard-empty'
  | 'combo-wrong-count'
  | 'cat-combo-mismatch'
  | 'invalid-target'
  | 'cant-target-self'
  | 'target-empty-handed'
  | 'named-card-required'
  | 'defuse-auto-only'
  | 'cant-play-kitten'
  | 'cant-favor-self'
  | 'nope-nothing-to-nope'
  | 'not-nopeable'
  | 'nope-self'
  | 'draw-pile-empty'
  | 'room-gone'
  | 'kick-not-in-lobby'
  | 'kick-target-not-found'
  | 'not-seated'

export interface Rejection {
  code: RejectionCode
  params?: Record<string, string | number>
}
