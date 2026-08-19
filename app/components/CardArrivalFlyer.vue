<template lang="pug">
.card-arrival(v-if="activeItems.length > 0" aria-hidden="true")
  .card-arrival__item(
    v-for="item in activeItems"
    :class="`card-arrival__item--${item.stage}`"
    :key="item.uid"
    :style="item.stage === 'flying' ? { transform: `translate3d(${item.targetX}px, ${item.targetY}px, 0) translate(-50%, -50%) scale(0.4)` } : {}"
  )
    .card-arrival__burst
    .card-arrival__glow
      CardImage(:card-id="item.id" :uid="item.uid" width="min(350px, 82vw)")
</template>

<script setup lang="ts">
  import type { Card, CardId } from "#shared/types/game"

  interface FlyingItem {
    uid: string
    id: CardId
    stage: "center" | "flying"
    targetX: number
    targetY: number
  }

  const props = defineProps<{
    arrivingCards: Card[]
    handAreaRect?: DOMRect | null
  }>()

  const emit = defineEmits<{
    landed: [uid: string]
  }>()

  const activeItems = ref<FlyingItem[]>([])
  const processingUids = new Set<string>()

  const reducedMotion = import.meta.client && window.matchMedia("(prefers-reduced-motion: reduce)").matches

  const REVEAL_MS = 1200
  const FLIGHT_MS = 420

  function computeTargetCoordinates(): { x: number; y: number } {
    if (props.handAreaRect) {
      // Target the right side of the hand area where new cards are appended
      const rightEdge = props.handAreaRect.right
      const centerY = props.handAreaRect.top + props.handAreaRect.height / 2
      return {
        x: Math.max(props.handAreaRect.left + 70, rightEdge - 80),
        y: centerY
      }
    }
    // Fallback if hand area rect is not yet measured
    if (typeof window !== "undefined") {
      return {
        x: window.innerWidth / 2 + 150,
        y: window.innerHeight - 80
      }
    }
    return { x: 0, y: 0 }
  }

  function processIncomingCard(card: Card, delayMs = 0) {
    if (processingUids.has(card.uid)) return
    processingUids.add(card.uid)

    const run = () => {
      if (reducedMotion) {
        emit("landed", card.uid)
        processingUids.delete(card.uid)
        return
      }

      const { x, y } = computeTargetCoordinates()
      const item: FlyingItem = {
        uid: card.uid,
        id: card.id,
        stage: "center",
        targetX: x,
        targetY: y
      }
      activeItems.value.push(item)

      // Stage 1 -> Stage 2: Center Reveal -> Fly to Hand
      setTimeout(() => {
        const idx = activeItems.value.findIndex((i) => i.uid === card.uid)
        if (idx !== -1) {
          // Re-measure fresh target coordinates right before flight
          const freshTarget = computeTargetCoordinates()
          activeItems.value[idx]!.targetX = freshTarget.x
          activeItems.value[idx]!.targetY = freshTarget.y
          activeItems.value[idx]!.stage = "flying"
        }

        // Stage 2 -> Landing: Complete
        setTimeout(() => {
          activeItems.value = activeItems.value.filter((i) => i.uid !== card.uid)
          processingUids.delete(card.uid)
          emit("landed", card.uid)
        }, FLIGHT_MS)
      }, REVEAL_MS)
    }

    if (delayMs > 0) {
      setTimeout(run, delayMs)
    } else {
      run()
    }
  }

  watch(
    () => props.arrivingCards,
    (newCards) => {
      if (!newCards || !newCards.length) return
      newCards.forEach((card, index) => {
        processIncomingCard(card, index * 160)
      })
    },
    { immediate: true, deep: true }
  )
</script>

<style scoped lang="scss">
  .card-arrival {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 30;
    overflow: hidden;

    &__item {
      position: fixed;
      display: flex;
      flex-direction: column;
      align-items: center;
      backface-visibility: hidden;
      -webkit-font-smoothing: antialiased;

      :deep(img) {
        image-rendering: -webkit-optimize-contrast;
        image-rendering: crisp-edges;
      }

      /* Center Reveal Stage - larger for prominent readability */
      &--center {
        left: 50vw;
        top: 50vh;
        transform: translate(-50%, -50%) scale(1);
        animation: center-reveal-pop 0.38s cubic-bezier(0.18, 0.9, 0.32, 1.2) forwards;
      }

      /* Flying Stage */
      &--flying {
        left: 0;
        top: 0;
        will-change: transform, opacity;
        transition:
          transform 0.42s cubic-bezier(0.2, 0.85, 0.35, 1.05),
          opacity 0.2s ease 0.28s;

        .card-arrival__burst {
          opacity: 0;
          transition: opacity 0.2s ease;
        }
      }
    }

    &__burst {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 560px;
      height: 560px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 194, 26, 0.5) 0%, rgba(255, 122, 26, 0.2) 50%, transparent 70%);
      z-index: -1;
      pointer-events: none;
      animation: burst-pulse 1.2s ease-out infinite;
    }

    &__glow {
      border-radius: var(--card-radius);
      box-shadow:
        0 0 40px rgba(255, 194, 26, 0.95),
        0 0 80px rgba(255, 122, 26, 0.6),
        0 35px 70px rgba(0, 0, 0, 0.88);
      animation: aura-glow 0.8s ease-in-out infinite alternate;
    }
  }

  @keyframes center-reveal-pop {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.4) rotate(-6deg);
    }
    70% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.05) rotate(2deg);
    }
    100% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1) rotate(0deg);
    }
  }

  @keyframes aura-glow {
    from {
      box-shadow:
        0 0 35px rgba(255, 194, 26, 0.85),
        0 0 60px rgba(255, 122, 26, 0.5),
        0 28px 50px rgba(0, 0, 0, 0.8);
    }
    to {
      box-shadow:
        0 0 50px rgba(255, 194, 26, 1),
        0 0 95px rgba(255, 122, 26, 0.8),
        0 40px 80px rgba(0, 0, 0, 0.95);
    }
  }

  @keyframes burst-pulse {
    0% {
      transform: translate(-50%, -50%) scale(0.8);
      opacity: 0.5;
    }
    50% {
      transform: translate(-50%, -50%) scale(1.15);
      opacity: 0.85;
    }
    100% {
      transform: translate(-50%, -50%) scale(1.3);
      opacity: 0;
    }
  }
</style>
