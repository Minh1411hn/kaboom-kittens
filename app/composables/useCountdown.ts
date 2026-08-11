/**
 * Turns an absolute server deadline into a ticking countdown. The server sends
 * deadlines rather than durations so a slow message or a skewed clock cannot
 * give one player extra seconds.
 */
export function useCountdown(deadline: () => number | null | undefined) {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    timer = setInterval(() => (now.value = Date.now()), 250)
  })
  onUnmounted(() => clearInterval(timer))

  const remaining = computed(() => {
    const at = deadline()
    if (!at) return null
    return Math.max(0, Math.ceil((at - now.value) / 1000))
  })

  /** 1 → just opened, 0 → expired. Drives the shrinking progress bars. */
  const fraction = computed(() => {
    const at = deadline()
    if (!at) return 0
    const left = at - now.value
    return Math.max(0, Math.min(1, left / 5000))
  })

  return { remaining, fraction }
}
