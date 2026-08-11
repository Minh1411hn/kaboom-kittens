<script setup lang="ts">
import type { Card } from '#shared/types/game'

const props = defineProps<{
  hand: Card[]
  selected: string[]
  disabled?: boolean
}>()

defineEmits<{ toggle: [uid: string] }>()

const CARD_W = 136
/** Roughly the width of the hand area on the table grid. */
const FAN_W = 1120

/**
 * Fans the cards out from the centre. Up to a full opening hand the cards
 * barely touch, so every title is readable; past that the overlap tightens to
 * keep the fan inside FAN_W however big the hand gets. Hovering lifts a card
 * clear of its neighbours, which is the escape hatch for a crowded hand.
 */
const overlap = computed(() => {
  const count = props.hand.length
  if (count < 2) return 0
  const needed = Math.ceil((CARD_W * count - FAN_W) / (count - 1))
  return Math.max(6, Math.min(96, needed))
})

const tilt = (index: number): string => {
  const middle = (props.hand.length - 1) / 2
  const offset = index - middle
  const angle = Math.max(-11, Math.min(11, offset * 2.6))
  const lift = Math.abs(offset) * 3.4
  return `rotate(${angle}deg) translateY(${lift}px)`
}
</script>

<template>
  <div class="hand" :class="{ disabled }">
    <div
      v-for="(card, index) in hand"
      :key="card.uid"
      class="slot"
      :style="{ marginLeft: index === 0 ? '0' : `-${overlap}px`, transform: tilt(index) }"
    >
      <button class="pick" @click="$emit('toggle', card.uid)">
        <CardImage
          :card-id="card.id"
          :uid="card.uid"
          :width="`${CARD_W}px`"
          :selected="selected.includes(card.uid)"
        />
      </button>
    </div>
    <p v-if="!hand.length" class="empty">No cards left.</p>
  </div>
</template>

<style scoped>
.hand {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  padding: 2.75rem 0.5rem 0.25rem;
  min-height: 150px;
}

.slot {
  transition: transform 0.15s ease;
  transform-origin: 50% 130%;
}

.slot:hover {
  z-index: 5;
}

.pick {
  padding: 0;
  border: none;
  background: none;
  box-shadow: none;
  display: block;
  border-radius: var(--card-radius);
}

.pick:active:not(:disabled) {
  transform: none;
}

.pick:hover:not(:disabled) {
  filter: none;
}

.pick:hover :deep(.card) {
  transform: translateY(-22px);
  box-shadow: 0 16px 30px rgb(20 8 0 / 55%);
}

.pick:hover :deep(.card.selected) {
  transform: translateY(-28px);
}

.hand.disabled .pick {
  cursor: not-allowed;
}

.hand.disabled :deep(.card) {
  filter: saturate(0.55) brightness(0.82);
}

.empty {
  color: var(--text-dim);
  text-shadow: 0 1px 2px rgb(30 12 0 / 60%);
}
</style>
