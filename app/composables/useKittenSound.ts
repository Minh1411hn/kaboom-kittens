import type { PublicGameState } from '#shared/types/game'

/**
 * Plays the explosion cue the instant anyone draws an Exploding Kitten.
 *
 * Same `state.log`-by-`seq` diffing as `useTurnSound`, but with no `youId`
 * filter: the reveal itself (`useKittenCeremony`) plays for the whole table,
 * so the sound that goes with it should too, not just for whoever drew.
 */

const SOUND_URL = '/audios/Draw.Kitten.Short.ogg'

export interface KittenSoundOptions {
  state: Ref<PublicGameState | null>
  /** Injected for tests; defaults to playing the real audio file. */
  play?: () => void
}

function defaultPlay(): () => void {
  let audio: HTMLAudioElement | null = null
  return () => {
    if (!import.meta.client) return
    if (!audio) audio = new Audio(SOUND_URL)
    audio.currentTime = 0
    // Never let a rejected autoplay promise surface as an unhandled error.
    audio.play().catch(() => {})
  }
}

export function useKittenSound(options: KittenSoundOptions): void {
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
      // reconnect would replay every kitten the table has ever drawn.
      if (highWater === null) {
        highWater = latest
        return
      }

      const fresh = snapshot.log.filter((event) => event.seq > highWater!)
      highWater = Math.max(highWater, latest)
      if (!fresh.length) return

      if (fresh.some((event) => event.type === 'kitten-drawn')) {
        play()
      }
    },
  )
}
