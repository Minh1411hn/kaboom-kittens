<template lang="pug">
.card-departure(v-if="card && baseStyle.left" aria-hidden="true")
  .card-departure__flyer(
    :class="{ 'card-departure__flyer--flying': flying }"
    :style="flying ? { ...baseStyle, transform: flightTransform } : baseStyle"
  )
    CardImage(:card-id="card.id" :uid="card.uid" :width="`${width}px`")
</template>

<script setup lang="ts">
  import type { Card } from "#shared/types/game"

  /**
   * A card leaving your hand for a pile, flown as a fixed-position clone.
   *
   * The mirror image of `CardArrivalFlyer` (centre → hand). Kept separate rather
   * than folded into it so the drag-to-draw arrival, which is the hot path, keeps
   * its timeline untouched.
   *
   * `fromRect` is measured by the caller *before* the card disappears from the
   * fan; `measureTo` is a function so the destination is read fresh at take-off.
   */
  const props = defineProps<{
    /** Non-null starts a flight; back to null clears whatever is on screen. */
    card: Card | null
    fromRect: DOMRect | null
    measureTo: () => DOMRect | null
  }>()

  const emit = defineEmits<{ done: [] }>()

  const FLIGHT_MS = 620

  const reducedMotion = import.meta.client && window.matchMedia("(prefers-reduced-motion: reduce)").matches

  const flying = ref(false)
  const baseStyle = ref<Record<string, string>>({})
  const flightTransform = ref("")
  const width = ref(140)
  let timer: ReturnType<typeof setTimeout> | undefined

  function stop(): void {
    clearTimeout(timer)
    timer = undefined
    flying.value = false
    baseStyle.value = {}
  }

  watch(
    () => props.card,
    (card) => {
      clearTimeout(timer)
      if (!card) {
        stop()
        return
      }

      const from = props.fromRect
      const to = props.measureTo()
      if (!from || !to || reducedMotion) {
        stop()
        emit("done")
        return
      }

      const dx = to.left + to.width / 2 - (from.left + from.width / 2)
      const dy = to.top + to.height / 2 - (from.top + from.height / 2)
      const scale = from.width ? to.width / from.width : 1

      width.value = from.width || 140
      baseStyle.value = {
        left: `${from.left + from.width / 2}px`,
        top: `${from.top + from.height / 2}px`
      }
      flightTransform.value = `translate(-50%, -50%) translate3d(${dx}px, ${dy}px, 0) scale(${scale}) rotate(-6deg)`
      flying.value = false

      // Two frames: one to paint the clone at its origin, one to start the
      // transition. A single frame occasionally lands both in the same paint
      // and the card simply teleports.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (props.card?.uid === card.uid) flying.value = true
        })
      )

      timer = setTimeout(() => {
        stop()
        emit("done")
      }, FLIGHT_MS)
    }
  )

  onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped lang="scss">
  .card-departure {
    position: fixed;
    inset: 0;
    pointer-events: none;
    /* Between the modals (20-25) and the kitten reveal (32). */
    z-index: 31;
    overflow: hidden;

    &__flyer {
      position: fixed;
      transform: translate(-50%, -50%);
      will-change: transform;
      transition: transform 0.62s cubic-bezier(0.2, 0.85, 0.35, 1.05);
      filter: drop-shadow(0 0 18px rgba(120, 235, 160, 0.85)) drop-shadow(0 18px 30px rgba(0, 0, 0, 0.7));

      &--flying {
        filter: drop-shadow(0 0 8px rgba(120, 235, 160, 0.25)) drop-shadow(0 12px 22px rgba(0, 0, 0, 0.6));
        transition:
          transform 0.62s cubic-bezier(0.2, 0.85, 0.35, 1.05),
          filter 0.5s ease 0.12s;
      }
    }
  }
</style>
