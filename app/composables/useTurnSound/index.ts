import type { PublicGameState } from '#shared/types/game'

/**
 * Plays a cue the instant it becomes *your* turn.
 *
 * Like `useKittenCeremony`, this watches `state.log` for a fresh event rather
 * than the static `currentPlayerId === youId` condition — a snapshot fires on
 * every table event (someone else's peek, a Nope resolving, ...), not just
 * turn changes, so watching the boolean would replay the cue on each one
 * while it stays your turn. Diffing by `seq` also means a reconnect that
 * lands mid-your-turn does not replay it either.
 */

const SOUND_URL = '/audios/YourTurn.3.ogg'

export interface TurnSoundOptions {
  state: Ref<PublicGameState | null>
  /** Your own player id, or undefined before the first snapshot. */
  youId: () => string | undefined
  /** Injected for tests; defaults to playing the real audio file. */
  play?: () => void
}

function defaultPlay(): () => void {
  let audio: HTMLAudioElement | null = null
  return () => {
    if (!import.meta.client) return
    if (!audio) audio = new Audio(SOUND_URL)
    audio.currentTime = 0
    // Autoplay policy is a non-issue in practice (the lobby's Ready/Join
    // buttons already produced a user gesture), but never let a rejected
    // promise surface as an unhandled error.
    audio.play().catch(() => {})
  }
}

export function useTurnSound(options: TurnSoundOptions): void {
  const play = options.play ?? defaultPlay()
  /** Highest log seq already accounted for; `null` until the first snapshot. */
  let highWater: number | null = null

  watch(
    () => options.state.value,
    (snapshot) => {
      if (!snapshot) {
        highWater = null
        return
      }

      const latest = snapshot.log.at(-1)?.seq ?? 0
      // The first snapshot of a session is history, not news — otherwise a
      // reconnect that lands mid-your-turn would replay the cue.
      if (highWater === null) {
        highWater = latest
        return
      }

      const fresh = snapshot.log.filter((event) => event.seq > highWater!)
      highWater = Math.max(highWater, latest)
      if (!fresh.length) return

      const youId = options.youId()
      if (youId && fresh.some((event) => event.type === 'turn-changed' && event.playerId === youId)) {
        play()
      }
    },
  )
}
