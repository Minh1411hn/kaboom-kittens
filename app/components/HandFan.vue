<script setup lang="ts">
import type { Card } from '#shared/types/game'

interface SlotItem {
  uid: string
  card: Card
  isLeaving: boolean
}

const props = defineProps<{
  hand: Card[]
  selected: string[]
  disabled?: boolean
  /** The card you just dragged off the deck — it flips over as it lands. */
  flipUid?: string | null
}>()

defineEmits<{ toggle: [uid: string] }>()

const CARD_W = 140
/** Roughly the width of the hand area on the table grid. */
const FAN_W = 1120

const slots = ref<SlotItem[]>([])
const leavingTimers = new Map<string, ReturnType<typeof setTimeout>>()

watch(
  () => props.hand,
  (newHand, oldHand) => {
    const newUids = new Set(newHand.map((c) => c.uid))

    if (!oldHand || oldHand.length === 0) {
      slots.value = newHand.map((c) => ({ uid: c.uid, card: c, isLeaving: false }))
      return
    }

    const removedFromProps = oldHand.filter((c) => !newUids.has(c.uid))
    const activeSlots: SlotItem[] = newHand.map((c) => ({
      uid: c.uid,
      card: c,
      isLeaving: false,
    }))

    // Keep leaving cards in their old relative positions with leaving animation
    for (const leavingCard of removedFromProps) {
      const oldIndex = slots.value.findIndex((s) => s.uid === leavingCard.uid)
      const leavingItem: SlotItem = {
        uid: leavingCard.uid,
        card: leavingCard,
        isLeaving: true,
      }

      const insertAt = oldIndex !== -1 ? Math.min(oldIndex, activeSlots.length) : activeSlots.length
      activeSlots.splice(insertAt, 0, leavingItem)

      if (leavingTimers.has(leavingCard.uid)) {
        clearTimeout(leavingTimers.get(leavingCard.uid))
      }
      const timer = setTimeout(() => {
        slots.value = slots.value.filter((s) => s.uid !== leavingCard.uid)
        leavingTimers.delete(leavingCard.uid)
      }, 650)
      leavingTimers.set(leavingCard.uid, timer)
    }

    slots.value = activeSlots
  },
  { immediate: true, deep: true },
)

onBeforeUnmount(() => {
  for (const timer of leavingTimers.values()) {
    clearTimeout(timer)
  }
  leavingTimers.clear()
})

/**
 * Fans the cards out from the centre. Up to a full opening hand the cards
 * barely touch, so every title is readable; past that the overlap tightens to
 * keep the fan inside FAN_W however big the hand gets. Hovering lifts a card
 * clear of its neighbours, which is the escape hatch for a crowded hand.
 */
const overlap = computed(() => {
  const count = slots.value.length
  if (count < 2) return 0
  const needed = Math.ceil((CARD_W * count - FAN_W) / (count - 1))
  return Math.max(6, Math.min(96, needed))
})

</script>

<template>
  <div class="hand" :class="{ disabled }">
    <div
      v-for="(item, index) in slots"
      :key="item.uid"
      class="slot"
      :class="{
        'flip-in': item.uid === flipUid,
        'leaving': item.isLeaving,
      }"
      :style="{ marginLeft: index === 0 ? '0' : `-${overlap}px` }"
    >
      <button
        class="pick"
        :disabled="item.isLeaving"
        @click="!item.isLeaving && $emit('toggle', item.uid)"
      >
        <CardImage
          :card-id="item.card.id"
          :uid="item.uid"
          :width="`${CARD_W}px`"
          :selected="selected.includes(item.uid)"
        />
      </button>
    </div>
    <p v-if="!slots.length" class="empty">No cards left.</p>
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
}

.slot:hover {
  z-index: 5;
}

/*
 * The tail end of the drag: the ghost you were holding was face down, so the
 * real card turns over as it settles into the fan. The `perspective()` function
 * goes inside the transform — the `perspective` property only affects children,
 * and the element animating here is the slot itself.
 */
.slot.flip-in {
  z-index: 6;
  animation: card-flip-in 0.36s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/*
 * Departure animation: when a card is played, stolen, or given, it lifts up
 * from its slot with a warning/departure glow, making it immediately clear
 * which card left the hand.
 */
.slot.leaving {
  z-index: 10;
  pointer-events: none;
  animation: card-lift-out 0.65s cubic-bezier(0.2, 0.85, 0.35, 1) forwards;
}

@keyframes card-lift-out {
  0% {
    transform: translateY(0) scale(1) rotate(0deg);
    opacity: 1;
    filter: none;
  }
  30% {
    transform: translateY(-80px) scale(1.08) rotate(-3deg);
    opacity: 1;
    filter: drop-shadow(0 0 20px rgba(255, 75, 43, 0.95)) drop-shadow(0 15px 25px rgba(0, 0, 0, 0.7));
  }
  70% {
    transform: translateY(-120px) scale(1.04) rotate(-5deg);
    opacity: 0.85;
    filter: drop-shadow(0 0 16px rgba(255, 75, 43, 0.8)) drop-shadow(0 20px 30px rgba(0, 0, 0, 0.8));
  }
  100% {
    transform: translateY(-170px) scale(0.9) rotate(-8deg);
    opacity: 0;
    filter: drop-shadow(0 0 8px rgba(255, 75, 43, 0));
  }
}

@keyframes card-flip-in {
  0% {
    transform: perspective(700px) translateY(-35px) rotateY(180deg) scale(1.06);
    filter: drop-shadow(0 0 16px rgba(255, 194, 26, 0.8));
  }

  70% {
    filter: drop-shadow(0 0 10px rgba(255, 194, 26, 0.4));
  }

  100% {
    transform: none;
    filter: none;
  }
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
  transform: translateY(-22px) scale(1.5);
  transform-origin: bottom center;
  box-shadow: 0 16px 30px rgb(20 8 0 / 55%);
  z-index: 50;
}

.pick:hover :deep(.card.selected) {
  transform: translateY(-28px) scale(1.5);
  transform-origin: bottom center;
  z-index: 50;
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
