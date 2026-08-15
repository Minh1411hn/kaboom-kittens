<script setup lang="ts">
import type { Card } from '#shared/types/game'

interface SlotItem {
  uid: string
  card: Card
  isLeaving: boolean
  /** Left the hand, but frozen in place while the kitten ceremony plays. */
  isHeld: boolean
}

const props = defineProps<{
  hand: Card[]
  selected: string[]
  disabled?: boolean
  /** The card you just dragged off the deck — it flips over as it lands. */
  flipUid?: string | null
  /**
   * A card that leaves the hand right now should sit still instead of lifting
   * out. `useKittenCeremony` raises this so the Exploding Kitten reveal plays
   * over an intact fan; when it drops, `CardDepartureFlyer` has taken the card
   * over and the slot simply vanishes.
   */
  holdLeave?: boolean
}>()

defineEmits<{ toggle: [uid: string] }>()

const CARD_W = 140
/** Roughly the width of the hand area on the table grid. */
const FAN_W = 1120

const slots = ref<SlotItem[]>([])
const leavingTimers = new Map<string, ReturnType<typeof setTimeout>>()
const slotEls = new Map<string, HTMLElement>()

function scheduleRemoval(uid: string): void {
  clearTimeout(leavingTimers.get(uid))
  const timer = setTimeout(() => {
    slots.value = slots.value.filter((s) => s.uid !== uid)
    leavingTimers.delete(uid)
  }, 650)
  leavingTimers.set(uid, timer)
}

function setSlotEl(uid: string, el: unknown): void {
  if (el instanceof HTMLElement) slotEls.set(uid, el)
  else slotEls.delete(uid)
}

watch(
  () => props.hand,
  (newHand, oldHand) => {
    const newUids = new Set(newHand.map((c) => c.uid))

    if (!oldHand || oldHand.length === 0) {
      slots.value = newHand.map((c) => ({ uid: c.uid, card: c, isLeaving: false, isHeld: false }))
      return
    }

    const removedFromProps = oldHand.filter((c) => !newUids.has(c.uid))
    const activeSlots: SlotItem[] = newHand.map((c) => ({
      uid: c.uid,
      card: c,
      isLeaving: false,
      isHeld: false,
    }))

    // Keep leaving cards in their old relative positions with leaving animation
    for (const leavingCard of removedFromProps) {
      const oldIndex = slots.value.findIndex((s) => s.uid === leavingCard.uid)
      const leavingItem: SlotItem = {
        uid: leavingCard.uid,
        card: leavingCard,
        isLeaving: !props.holdLeave,
        isHeld: Boolean(props.holdLeave),
      }

      const insertAt = oldIndex !== -1 ? Math.min(oldIndex, activeSlots.length) : activeSlots.length
      activeSlots.splice(insertAt, 0, leavingItem)

      if (leavingItem.isLeaving) scheduleRemoval(leavingCard.uid)
      else clearTimeout(leavingTimers.get(leavingCard.uid))
    }

    slots.value = activeSlots
  },
  { immediate: true, deep: true },
)

/*
 * Held and leaving are the same slots seen at two different moments, and the
 * flag can flip either before or after the hand prop lands. Reconciling here
 * as well as in the diff above makes the order of the two irrelevant.
 */
watch(
  () => props.holdLeave,
  (hold) => {
    if (hold) {
      for (const slot of slots.value) {
        if (!slot.isLeaving) continue
        clearTimeout(leavingTimers.get(slot.uid))
        leavingTimers.delete(slot.uid)
        slot.isLeaving = false
        slot.isHeld = true
      }
      return
    }
    // Released: the flyer is carrying the card now, so drop the slot outright
    // rather than replaying the lift-out on a card that already flew away.
    slots.value = slots.value.filter((s) => !s.isHeld)
  },
)

onBeforeUnmount(() => {
  for (const timer of leavingTimers.values()) {
    clearTimeout(timer)
  }
  leavingTimers.clear()
  slotEls.clear()
})

/** Where a card sits on screen, for animations that fly out of the fan. */
function slotRect(uid: string): DOMRect | null {
  return slotEls.get(uid)?.getBoundingClientRect() ?? null
}

defineExpose({ slotRect })

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
      :ref="(el) => setSlotEl(item.uid, el)"
      class="slot"
      :class="{
        'flip-in': item.uid === flipUid,
        'leaving': item.isLeaving,
        'held': item.isHeld,
      }"
      :style="{ marginLeft: index === 0 ? '0' : `-${overlap}px` }"
    >
      <button
        class="pick"
        :disabled="item.isLeaving || item.isHeld"
        @click="!item.isLeaving && !item.isHeld && $emit('toggle', item.uid)"
      >
        <CardImage
          :card-id="item.card.id"
          :uid="item.uid"
          :width="`${CARD_W}px`"
          :selected="selected.includes(item.uid)"
        />
      </button>
    </div>
    <p v-if="!slots.length" class="empty">Không còn lá bài nào trên tay.</p>
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

/*
 * Held: the card has already left the hand on the server, but the Exploding
 * Kitten reveal is playing, so it waits its turn with a green "about to save
 * you" glow instead of animating out.
 */
.slot.held {
  z-index: 9;
  pointer-events: none;
  animation: card-held-glow 0.9s ease-in-out infinite alternate;
}

@keyframes card-held-glow {
  from {
    transform: translateY(-10px) scale(1.02);
    filter: drop-shadow(0 0 10px rgba(120, 235, 160, 0.5));
  }
  to {
    transform: translateY(-18px) scale(1.05);
    filter: drop-shadow(0 0 22px rgba(120, 235, 160, 0.95));
  }
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
  transform: translateY(-22px) scale(1.35);
  transform-origin: bottom center;
  box-shadow: 0 16px 30px rgb(20 8 0 / 55%);
  z-index: 50;
}

.pick:hover :deep(.card.selected) {
  transform: translateY(-28px) scale(1.35);
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
