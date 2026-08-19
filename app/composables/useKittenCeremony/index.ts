import type { Card, PublicGameState } from '#shared/types/game'

/**
 * The three-beat ceremony for drawing an Exploding Kitten.
 *
 * The server does the whole thing in one command — `kitten-drawn`,
 * `kitten-defused`, the Defuse leaving your hand and the `choose-deck-position`
 * interaction all arrive in a single snapshot (server/game/effects.ts, the
 * `DRAW` case). Left alone the client would show the dialog on top of a hand
 * that has already quietly lost a card, which reads as nothing happening at
 * all. So the client stages it:
 *
 *   reveal (everyone)  →  the Defuse flies to the discard (its owner)  →  dialog
 *
 * This is the only place in the app that reads `state.log` to drive animation.
 * Nothing here touches the server: the kitten's uid is redacted, so the reveal
 * keys its artwork off the event `seq`, which every client shares.
 */

export type KittenCeremonyPhase = 'idle' | 'reveal' | 'defuse'

/** How long the kitten sits in the middle of the screen. */
export const REVEAL_MS = 3000
/** Fallback in case the departure flyer never reports back. */
const DEFUSE_TIMEOUT_MS = 1200
/** Hard ceiling. The dialog must never be held hostage by a stuck animation. */
const MAX_CEREMONY_MS = 4500

interface Ceremony {
  seq: number
  playerName: string
  /** Only set when the Defuse left *your* hand — nobody animates someone else's. */
  defuseCard: Card | null
}

export interface KittenCeremonyOptions {
  state: Ref<PublicGameState | null>
  /** Your own player id, or undefined before the first snapshot. */
  youId: () => string | undefined
  /**
   * Measures where a card sits in your hand, called the instant the ceremony
   * starts — the DOM still holds the pre-snapshot fan at that point, which is
   * exactly the position the Defuse should fly out of.
   */
  captureRect?: (uid: string) => DOMRect | null
}

export function useKittenCeremony(options: KittenCeremonyOptions) {
  const phase = ref<KittenCeremonyPhase>('idle')
  const revealSeq = ref<number | null>(null)
  const revealPlayerName = ref('')
  const revealDefused = ref(false)
  const defuseCard = ref<Card | null>(null)
  const defuseFromRect = ref<DOMRect | null>(null)

  const reducedMotion =
    import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const queue: Ceremony[] = []
  /** A ref, because `holdLeave` is computed from it. */
  const pendingDefuse = ref<Card | null>(null)
  /** Highest log seq already accounted for; `null` until the first snapshot. */
  let highWater: number | null = null
  /** Your hand as of the previous snapshot, to spot what just left it. */
  let lastHand = new Map<string, Card>()

  let revealTimer: ReturnType<typeof setTimeout> | undefined
  let defuseTimer: ReturnType<typeof setTimeout> | undefined
  let capTimer: ReturnType<typeof setTimeout> | undefined

  function clearTimers(): void {
    clearTimeout(revealTimer)
    clearTimeout(defuseTimer)
    clearTimeout(capTimer)
    revealTimer = defuseTimer = capTimer = undefined
  }

  function reset(): void {
    clearTimers()
    phase.value = 'idle'
    revealSeq.value = null
    revealPlayerName.value = ''
    revealDefused.value = false
    defuseCard.value = null
    defuseFromRect.value = null
    pendingDefuse.value = null
  }

  /** End the current ceremony and start whatever queued up behind it. */
  function finish(): void {
    reset()
    const next = queue.shift()
    if (next) start(next)
  }

  function abort(): void {
    queue.length = 0
    reset()
  }

  function start(ceremony: Ceremony): void {
    clearTimers()
    phase.value = 'reveal'
    revealSeq.value = ceremony.seq
    revealPlayerName.value = ceremony.playerName
    revealDefused.value = Boolean(ceremony.defuseCard)
    pendingDefuse.value = ceremony.defuseCard
    defuseCard.value = null
    // Measured now, while the fan is still showing the pre-snapshot hand.
    defuseFromRect.value = ceremony.defuseCard
      ? (options.captureRect?.(ceremony.defuseCard.uid) ?? null)
      : null

    capTimer = setTimeout(finish, MAX_CEREMONY_MS)
    revealTimer = setTimeout(() => {
      if (!pendingDefuse.value) {
        finish()
        return
      }
      phase.value = 'defuse'
      defuseCard.value = pendingDefuse.value
      pendingDefuse.value = null
      defuseTimer = setTimeout(finish, DEFUSE_TIMEOUT_MS)
    }, REVEAL_MS)
  }

  function enqueue(ceremony: Ceremony): void {
    if (phase.value === 'idle') start(ceremony)
    else queue.push(ceremony)
  }

  /** The departure flight landed — move on without waiting out the fallback. */
  function onDefuseFlightDone(): void {
    if (phase.value === 'defuse') finish()
  }

  watch(
    () => options.state.value,
    (snapshot) => {
      if (!snapshot) {
        highWater = null
        lastHand = new Map()
        abort()
        return
      }

      const hand = snapshot.you?.hand ?? []
      const previous = lastHand
      lastHand = new Map(hand.map((card) => [card.uid, card]))

      if (snapshot.status !== 'playing') {
        abort()
        highWater = snapshot.log.at(-1)?.seq ?? 0
        return
      }

      const latest = snapshot.log.at(-1)?.seq ?? 0
      // The first snapshot of a session is history, not news. `resetRoom` puts
      // `seenSeq` back to 0, so without this a reconnect would replay every
      // kitten the table has ever drawn.
      if (highWater === null) {
        highWater = latest
        return
      }

      const fresh = snapshot.log.filter((event) => event.seq > highWater!)
      highWater = Math.max(highWater, latest)
      if (reducedMotion || !fresh.length) return

      const youId = options.youId()
      for (const event of fresh) {
        if (event.type !== 'kitten-drawn') continue
        const defused = fresh.some(
          (other) => other.type === 'kitten-defused' && other.playerId === event.playerId,
        )
        // Only the owner animates the Defuse, and only the card that actually
        // left the hand in this very snapshot.
        const defuseCardLeaving =
          defused && event.playerId === youId
            ? ([...previous.values()].find(
                (card) => card.id === 'defuse' && !lastHand.has(card.uid),
              ) ?? null)
            : null
        enqueue({
          seq: event.seq,
          playerName:
            snapshot.players.find((player) => player.id === event.playerId)?.nickname ?? '',
          defuseCard: defuseCardLeaving,
        })
      }
    },
  )

  onScopeDispose(() => abort())

  return {
    phase,
    revealSeq,
    revealPlayerName,
    revealDefused,
    defuseCard,
    defuseFromRect,
    /**
     * Freeze the card that just left your hand in place, so the reveal plays
     * over an intact fan. Released as soon as the flyer takes the card over.
     */
    holdLeave: computed(() => phase.value === 'reveal' && Boolean(pendingDefuse.value)),
    /** While true, `DeckPositionModal` waits its turn. */
    blocking: computed(() => phase.value !== 'idle'),
    onDefuseFlightDone,
  }
}
