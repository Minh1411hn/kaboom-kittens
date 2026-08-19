/**
 * Drag-to-draw. Drawing is the most consequential act in the game, so it is a
 * gesture rather than a click: press the draw pile, pull the top card down into
 * your hand, release. Releasing anywhere else springs it back and draws nothing.
 *
 * Pointer Events rather than HTML5 drag-and-drop — DnD does not fire on touch
 * and cannot render a custom drag image reliably. All the composable owns is the
 * gesture; the page owns the socket and calls `onDrop` when the drop lands.
 */

export type DrawDragPhase =
  /** Nothing in flight. */
  | 'idle'
  /** Pressed, but not yet past the movement threshold — still cancellable as a tap. */
  | 'lifting'
  /** The ghost is out and tracking the pointer. */
  | 'dragging'
  /** Dropped outside the hand; the ghost is flying home. */
  | 'returning'
  /** Dropped on the hand; `draw-card` is sent and we are waiting on the snapshot. */
  | 'awaiting'

export interface DrawDragOptions {
  /** Same guard as the deck button: your turn, alive, no interaction or Nope window. */
  canDraw: () => boolean
  /** The hand area's rect, measured fresh at drag start. */
  dropRect: () => DOMRect | null
  /** Fired once, on a drop that landed in the hand. */
  onDrop: () => void
}

/** Movement before a press becomes a drag, so a stray tap never paints a ghost. */
const THRESHOLD = 8
/** How forgiving the hand area is as a target. */
const DROP_PADDING = 24
/** Ghost flight home. Must match the transition in DrawGhost.vue. */
const RETURN_MS = 240
/** If the server never answers, do not strand the ghost on screen. */
const AWAIT_TIMEOUT_MS = 3000

export function useDrawDrag(options: DrawDragOptions) {
  const phase = ref<DrawDragPhase>('idle')
  /** Ghost centre, in viewport coordinates. */
  const x = ref(0)
  const y = ref(0)
  const overDropZone = ref(false)

  const reducedMotion
    = import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let pointerId: number | null = null
  let element: HTMLElement | null = null
  /** Where the pointer sat inside the deck, so the card does not jump under the finger. */
  let grabX = 0
  let grabY = 0
  let startX = 0
  let startY = 0
  let deckX = 0
  let deckY = 0
  let rect: DOMRect | null = null
  let awaitTimer: ReturnType<typeof setTimeout> | undefined
  let returnTimer: ReturnType<typeof setTimeout> | undefined

  const dragging = computed(() => phase.value === 'dragging')
  const ghostVisible = computed(() => phase.value !== 'idle' && phase.value !== 'lifting')

  function start(event: PointerEvent): void {
    if (phase.value !== 'idle' || !options.canDraw()) return
    if (event.button !== 0 && event.pointerType === 'mouse') return

    const el = event.currentTarget as HTMLElement | null
    if (!el) return

    const deck = el.getBoundingClientRect()
    deckX = deck.left + deck.width / 2
    deckY = deck.top + deck.height / 2
    grabX = event.clientX - deckX
    grabY = event.clientY - deckY
    startX = event.clientX
    startY = event.clientY
    rect = options.dropRect()

    pointerId = event.pointerId
    element = el
    // jsdom has no pointer capture, and neither does every browser for every
    // pointer type — the window-less listeners below work either way.
    el.setPointerCapture?.(event.pointerId)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)

    phase.value = 'lifting'
    moveTo(event.clientX, event.clientY)
    event.preventDefault()
  }

  function moveTo(clientX: number, clientY: number): void {
    x.value = clientX - grabX
    y.value = clientY - grabY
    overDropZone.value = hits(clientX, clientY)
  }

  function hits(clientX: number, clientY: number): boolean {
    if (!rect) return false
    return (
      clientX >= rect.left - DROP_PADDING
      && clientX <= rect.right + DROP_PADDING
      && clientY >= rect.top - DROP_PADDING
      && clientY <= rect.bottom + DROP_PADDING
    )
  }

  function onMove(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return
    if (phase.value === 'lifting') {
      const far = Math.hypot(event.clientX - startX, event.clientY - startY) >= THRESHOLD
      if (!far) return
      phase.value = 'dragging'
    }
    if (phase.value !== 'dragging') return
    moveTo(event.clientX, event.clientY)
    event.preventDefault()
  }

  function onUp(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return
    const landed = phase.value === 'dragging' && hits(event.clientX, event.clientY)
    detach()

    if (landed) {
      // Park the ghost over the hand while the command is in flight.
      if (rect) {
        x.value = rect.left + rect.width / 2
        y.value = rect.top + rect.height / 2
      }
      phase.value = 'awaiting'
      awaitTimer = setTimeout(() => resolve(), AWAIT_TIMEOUT_MS)
      options.onDrop()
      return
    }

    if (phase.value === 'dragging' && !reducedMotion) {
      phase.value = 'returning'
      x.value = deckX
      y.value = deckY
      returnTimer = setTimeout(() => {
        if (phase.value === 'returning') phase.value = 'idle'
      }, RETURN_MS)
      return
    }

    phase.value = 'idle'
  }

  function onCancel(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return
    detach()
    phase.value = 'idle'
  }

  /**
   * Abandons a gesture still in the hand — the turn clock can run out mid-drag,
   * at which point the server draws for you and the card you are holding is a
   * lie. A drop already sent (`awaiting`) is past the point of recall.
   */
  function cancel(): void {
    if (phase.value === 'idle' || phase.value === 'awaiting') return
    detach()
    clearTimeout(returnTimer)
    phase.value = 'idle'
  }

  /** Ends the `awaiting` phase — the page calls this on the next snapshot. */
  function resolve(): void {
    clearTimeout(awaitTimer)
    awaitTimer = undefined
    if (phase.value === 'awaiting') phase.value = 'idle'
  }

  function detach(): void {
    if (!element) return
    element.removeEventListener('pointermove', onMove)
    element.removeEventListener('pointerup', onUp)
    element.removeEventListener('pointercancel', onCancel)
    // `releasePointerCapture` throws if the pointer is already gone, which it is
    // after a normal pointerup — only release a capture we still hold.
    if (pointerId !== null && element.hasPointerCapture?.(pointerId)) {
      element.releasePointerCapture(pointerId)
    }
    element = null
    pointerId = null
  }

  onScopeDispose(() => {
    detach()
    clearTimeout(awaitTimer)
    clearTimeout(returnTimer)
  })

  return {
    phase: readonly(phase),
    x: readonly(x),
    y: readonly(y),
    overDropZone: readonly(overDropZone),
    dragging,
    ghostVisible,
    reducedMotion,
    start,
    cancel,
    resolve,
  }
}
