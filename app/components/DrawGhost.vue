<script setup lang="ts">
import type { DrawDragPhase } from '~/composables/useDrawDrag'

const props = defineProps<{
  phase: DrawDragPhase
  x: number
  y: number
  /** Suppresses the flight tweens; the ghost still tracks the pointer 1:1. */
  reducedMotion?: boolean
}>()

const back = cardBackUrl()

/**
 * Only the phases that move on their own get a transition. While `dragging`
 * there must be none at all or the card lags behind the finger.
 */
const eased = computed(
  () => !props.reducedMotion && (props.phase === 'returning' || props.phase === 'awaiting'),
)
</script>

<template>
  <div
    class="ghost"
    :class="[phase, { eased }]"
    aria-hidden="true"
    :style="{ transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)` }"
  >
    <img :src="back" alt="" draggable="false" />
  </div>
</template>

<style scoped>
/*
 * Fixed to the viewport because the drag crosses the whole page — the deck sits
 * in the middle of the table grid and the hand is at the bottom. z-index clears
 * the Nope overlay (8) but stays under the endgame curtain (12) and the
 * interaction modal, neither of which can be open mid-draw.
 */
.ghost {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 20;
  pointer-events: none;
  width: 168px;
  aspect-ratio: var(--card-ratio);
  border-radius: 22px;
  overflow: hidden;
  will-change: transform;
  box-shadow:
    inset 0 0 0 3px rgb(255 255 255 / 45%),
    0 24px 44px rgb(20 8 0 / 65%);
}

.ghost img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Shrinks from deck size to hand-card size as it travels, so it arrives already
   the right size for the fan. */
.ghost.dragging,
.ghost.awaiting {
  width: 136px;
  border-radius: var(--card-radius);
}

/* A slight tilt sells "picked up". `rotate` is its own property so it composes
   with the inline positioning transform instead of fighting it. */
.ghost.dragging {
  rotate: -4deg;
  transition: width 0.18s ease, rotate 0.18s ease;
}

.ghost.eased {
  transition:
    transform 0.24s cubic-bezier(0.22, 1, 0.36, 1),
    rotate 0.24s ease,
    width 0.18s ease,
    opacity 0.2s ease;
}

.ghost.returning {
  opacity: 0.5;
}
</style>
