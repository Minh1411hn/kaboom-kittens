<script setup lang="ts">
/**
 * The parchment sign hanging beside the table. It owns the "whose turn is it"
 * message and the turn clock; the page passes the actual controls through the
 * default slot so play/draw handling stays where the socket lives.
 */
const props = defineProps<{
  isYourTurn: boolean
  currentPlayerName: string
  /** Why the current selection cannot be played, or what to do next. */
  hint?: string
  deadline: number | null
  /** Seat colour of whoever is on the clock, for the pictogram. */
  actorColor: string
}>()

const { remaining, fraction } = useCountdown(() => props.deadline)

const back = cardBackUrl()

const headline = computed(() =>
  props.isYourTurn ? "It's your turn!" : `Waiting for ${props.currentPlayerName}`,
)
</script>

<template>
  <div class="banner" :class="{ live: isYourTurn }">
    <div class="rod" aria-hidden="true" />

    <div class="sheet">
      <div class="pictogram" aria-hidden="true">
        <span class="who" :style="{ background: actorColor }" />
        <span class="arrow">→</span>
        <img class="card-glyph" :src="back" alt="" draggable="false" />
      </div>

      <strong class="headline">{{ headline }}</strong>

      <p v-if="hint" class="hint">{{ hint }}</p>

      <div v-if="remaining !== null" class="clock" :class="{ urgent: remaining <= 10 }">
        <span class="clock-text">{{ remaining }}s</span>
        <span class="clock-track"><span class="clock-fill" :style="{ transform: `scaleX(${fraction})` }" /></span>
      </div>

      <div class="controls">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  max-width: 300px;
}

/* The rail the sign hangs from, with a ball finial at each end. */
.rod {
  position: relative;
  height: 7px;
  margin: 0 -10px 0;
  border-radius: 999px;
  background: linear-gradient(180deg, #f0f2f6, #9aa3b2 45%, #5d6472);
  box-shadow: 0 2px 5px rgb(20 8 0 / 55%);
}

.rod::before,
.rod::after {
  content: '';
  position: absolute;
  top: -5px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 28%, #fff, #a8b0bd 55%, #5d6472);
  box-shadow: 0 2px 5px rgb(20 8 0 / 55%);
}

.rod::before {
  left: -8px;
}

.rod::after {
  right: -8px;
}

/*
 * Torn parchment: the clip-path jitters the bottom edge, and the inset shadow
 * gives the sheet a bit of thickness where it curls.
 */
.sheet {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  padding: 1.1rem 1.15rem 1.9rem;
  color: var(--ink);
  text-align: center;
  background: linear-gradient(180deg, #f8ecd2, var(--parchment) 40%, var(--parchment-2));
  box-shadow: var(--shadow);
  clip-path: polygon(
    0% 0%, 100% 0%, 100% 93%,
    92% 97%, 84% 93%, 75% 98%, 66% 94%, 57% 99%,
    48% 94%, 39% 98%, 30% 93%, 21% 98%, 12% 94%, 4% 97%, 0% 93%
  );
}

.pictogram {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.who {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  box-shadow: inset 0 -3px 6px rgb(0 0 0 / 25%), inset 0 2px 4px rgb(255 255 255 / 40%);
}

.arrow {
  font-size: 1.3rem;
  color: var(--ink-dim);
}

.card-glyph {
  width: 26px;
  aspect-ratio: var(--card-ratio);
  border-radius: 4px;
  object-fit: cover;
  box-shadow: 0 2px 4px rgb(0 0 0 / 35%);
}

.headline {
  font-family: var(--font-display);
  font-size: 1.55rem;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--ink);
}

.banner.live .headline {
  color: #a5201a;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.3;
  color: var(--ink-dim);
  min-height: 1.1em;
}

.clock {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
}

.clock-text {
  font-family: var(--font-display);
  font-size: 0.82rem;
  letter-spacing: 1px;
  color: var(--ink-dim);
  font-variant-numeric: tabular-nums;
}

.clock-track {
  width: 100%;
  height: 5px;
  border-radius: 999px;
  overflow: hidden;
  background: rgb(120 95 55 / 30%);
}

.clock-fill {
  display: block;
  height: 100%;
  transform-origin: left;
  background: linear-gradient(90deg, #6b9b2f, #b5d24a);
  transition: transform 0.25s linear;
}

.clock.urgent .clock-text {
  color: #a5201a;
}

.clock.urgent .clock-fill {
  background: linear-gradient(90deg, #a5201a, var(--bad));
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  width: 100%;
  margin-top: 0.15rem;
}

.controls :deep(button) {
  width: 100%;
}
</style>
