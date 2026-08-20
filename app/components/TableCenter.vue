<template lang="pug">
.table-center
  .table-center__pile.table-center__direction-indicator(
    :aria-label="direction === 1 ? 'Chiều bốc bài: Thuận chiều kim đồng hồ' : 'Chiều bốc bài: Ngược chiều kim đồng hồ'"
    :title="direction === 1 ? 'Chiều bốc bài: Thuận chiều kim đồng hồ' : 'Chiều bốc bài: Ngược chiều kim đồng hồ'"
  )
    .table-center__direction-badge.direction-badge(
      :class="{ 'table-center__direction-badge--ccw ccw': direction === -1 }"
    )
      span.table-center__direction-icon
        Icon(:name="direction === 1 ? 'lucide:rotate-cw' : 'lucide:rotate-ccw'" aria-hidden="true")
    span.table-center__ribbon.table-center__ribbon--quiet Chiều bốc bài

  .table-center__pile
    button.table-center__deck.deck(
      :aria-label="`Chồng bài rút, còn ${drawCount} lá. Kéo lá bài trên cùng về tay bạn, hoặc nhấn phím Cách / Enter để rút bài.`"
      :class="{ 'table-center__deck--dragging dragging': dragging }"
      :disabled="!canDraw"
      :title="canDraw ? 'Kéo lá bài trên cùng về tay của bạn để rút bài' : ''"
      @keydown.enter.prevent="$emit('draw')"
      @keydown.space.prevent="$emit('draw')"
      @pointerdown="$emit('drawPointerDown', $event)"
    )
      span.table-center__pile-face
        img.table-center__card-back(:src="back" alt="" draggable="false")
    span.table-center__ribbon Còn {{ drawCount }} lá

  .table-center__pile
    .table-center__discard.discard(ref="discardEl")
      CardImage(v-if="discardTop" :card-id="discardTop.id" :uid="discardTop.uid" width="140px")
      .table-center__empty(v-else) Trống
    span.table-center__ribbon.table-center__ribbon--quiet Bài đã đánh · {{ discardCount }}
</template>

<script setup lang="ts">
  import type { Card } from "#shared/types/game"

  const props = defineProps<{
    drawCount: number
    discardTop: Card | null
    discardCount: number
    direction: 1 | -1
    canDraw: boolean
    deadline: number | null
    peek?: Card[] | null
    /** The ghost is out, so the top of the stack should read as lifted off. */
    dragging?: boolean
  }>()

  defineEmits<{
    /** The keyboard path — a mouse click deliberately does not draw. */
    draw: []
    /** Hands the gesture to `useDrawDrag` in the page. */
    drawPointerDown: [PointerEvent]
  }>()

  const { remaining } = useCountdown(() => props.deadline)

  const back = cardBackUrl()

  /** Where a card flying out of a hand should land — see `CardDepartureFlyer`. */
  const discardEl = useTemplateRef<HTMLElement>("discardEl")
  defineExpose({
    discardRect: (): DOMRect | null => discardEl.value?.getBoundingClientRect() ?? null
  })
</script>

<style scoped lang="scss">
  .table-center {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2rem;

    &__pile {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.6rem;
    }

    &__direction-indicator {
      justify-content: flex-end;
    }

    &__direction-badge {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: $cream-card;
      border: 2px solid $ink;
      box-shadow: $shadow-sm;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: auto 0;
      transition:
        transform 0.2s ease,
        border-color 0.2s ease,
        box-shadow 0.2s ease;

      &:hover {
        transform: scale(1.08);
        border-color: rgb(255 194 26 / 50%);
        box-shadow:
          inset 0 1px 0 rgb(255 255 255 / 35%),
          0 0 16px rgb(255 194 26 / 35%);
      }

      &--ccw {
        border-color: rgb(255 122 26 / 40%);
      }
    }

    &__direction-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      line-height: 1;
      color: var(--warn);
      text-shadow: 0 2px 6px rgb(20 8 0 / 70%);
    }

    /*
     * The draw pile is a squat tile rather than a card so it reads as a stack.
     * Two offset layers behind it stand in for the rest of the deck.
     */
    &__deck {
      position: relative;
      padding: 0;
      border: none;
      border-radius: 22px;
      background: none;
      box-shadow: none;
      /* Without this the browser claims the gesture and scrolls the page instead. */
      touch-action: none;
      user-select: none;
      -webkit-tap-highlight-color: transparent;

      &::before,
      &::after {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 0;
        border-radius: 22px;
        background: linear-gradient(180deg, #b9291f, #7d1210);
        box-shadow: var(--shadow-sm);
      }

      &::before {
        transform: translate(7px, 7px);
      }

      &::after {
        transform: translate(3.5px, 3.5px);
      }

      &:not(:disabled) {
        cursor: grab;

        .table-center__pile-face {
          box-shadow:
            inset 0 0 0 3px rgb(255 255 255 / 45%),
            0 0 0 4px rgb(255 194 26 / 65%),
            0 0 34px rgb(255 140 40 / 65%);
        }

        &:hover .table-center__pile-face {
          transform: translateY(-5px);
        }
      }

      /* The top card is in your hand, not on the stack — leave the two offset layers
           behind it standing so the pile still reads as a pile. */
      &--dragging {
        cursor: grabbing;

        .table-center__pile-face {
          opacity: 0.3;
          box-shadow: none;
        }
      }

      &:disabled {
        opacity: 1;
      }

      &:active:not(:disabled) {
        transform: none;
      }
    }

    &__pile-face {
      position: relative;
      z-index: 1;
      display: block;
      width: 168px;
      aspect-ratio: var(--card-ratio);
      border-radius: 22px;
      overflow: hidden;
      box-shadow:
        inset 0 0 0 3px rgb(255 255 255 / 30%),
        0 8px 20px rgb(25 8 0 / 55%);
      transition:
        transform 0.12s ease,
        box-shadow 0.15s ease;
    }

    &__card-back {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    /* A nameplate under each pile. */
    &__ribbon {
      font-family: var(--font-display);
      text-transform: uppercase;
      letter-spacing: 1.2px;
      font-size: 0.95rem;
      color: $ink;
      background: $cream-card;
      border: 2px solid $ink;
      box-shadow: $shadow-sm;
      border-radius: 999px;
      padding: 0.28rem 0.9rem;
      white-space: nowrap;

      &--quiet {
        font-size: 0.8rem;
        color: $ink-dim;
        background: $cream;
      }
    }

    &__discard {
      display: grid;
      place-items: center;
      transition: transform 0.15s ease;

      &:hover {
        transform: scale(1.175);
        z-index: 10;
        position: relative;
      }
    }

    &__empty {
      width: 140px;
      aspect-ratio: var(--card-ratio);
      border: 3px dashed rgb(255 255 255 / 25%);
      border-radius: var(--card-radius);
      display: grid;
      place-items: center;
      color: var(--text-dim);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
  }
</style>
