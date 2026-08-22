<template lang="pug">
.turn-banner(:class="{ 'turn-banner--live': isYourTurn }")
  .turn-banner__sheet
    .turn-banner__pictogram(aria-hidden="true")
      span.turn-banner__who(:style="{ background: actorColor }")
      span.turn-banner__arrow
        Icon(name="lucide:arrow-right")
      img.turn-banner__card-glyph(:src="back" alt="" draggable="false")

    strong.turn-banner__headline {{ headline }}

    p.turn-banner__hint(v-if="hint") {{ hint }}

    .turn-banner__clock(v-if="remaining !== null" :class="{ 'turn-banner__clock--urgent': remaining <= 10 }")
      span.turn-banner__clock-text {{ remaining }}s
      span.turn-banner__clock-track
        span.turn-banner__clock-fill(:style="{ transform: `scaleX(${fraction})` }")

    .turn-banner__controls
      slot
</template>

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

  const { t } = useI18n()
  const headline = computed(() =>
    props.isYourTurn
      ? t("table.turn_banner.your_turn")
      : t("table.turn_banner.waiting_for", { name: props.currentPlayerName })
  )
</script>

<style scoped lang="scss">
  .turn-banner {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    max-width: 300px;

    &--live {
      .turn-banner__headline {
        color: #a5201a;
      }
    }

    &__sheet {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.55rem;
      padding: 1.1rem 1.15rem;
      color: var(--ink);
      text-align: center;
      background: linear-gradient(180deg, #f8ecd2, var(--parchment) 40%, var(--parchment-2));
      border: var(--outline-width) solid var(--ink);
      border-radius: var(--radius);
      box-shadow: var(--shadow-sm);
    }

    &__pictogram {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }

    &__who {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      box-shadow:
        inset 0 -3px 6px rgb(0 0 0 / 25%),
        inset 0 2px 4px rgb(255 255 255 / 40%);
    }

    &__arrow {
      font-size: 1.3rem;
      color: var(--ink-dim);
    }

    &__card-glyph {
      width: 26px;
      aspect-ratio: var(--card-ratio);
      border-radius: 4px;
      object-fit: cover;
      box-shadow: 0 2px 4px rgb(0 0 0 / 35%);
    }

    &__headline {
      font-family: var(--font-display);
      font-size: 1.55rem;
      font-weight: 700;
      line-height: 1.05;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: var(--ink);
    }

    &__hint {
      margin: 0;
      font-size: 0.85rem;
      line-height: 1.3;
      color: #4d3824;
      font-weight: 500;
      min-height: 1.1em;
    }

    &__clock {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.2rem;

      &--urgent {
        .turn-banner__clock-text {
          color: #a5201a;
        }

        .turn-banner__clock-fill {
          background: linear-gradient(90deg, #a5201a, var(--bad));
        }
      }
    }

    &__clock-text {
      font-family: var(--font-display);
      font-size: 0.82rem;
      letter-spacing: 1px;
      color: var(--ink-dim);
      font-variant-numeric: tabular-nums;
    }

    &__clock-track {
      width: 100%;
      height: 5px;
      border-radius: 999px;
      overflow: hidden;
      background: rgb(120 95 55 / 30%);
    }

    &__clock-fill {
      display: block;
      height: 100%;
      transform-origin: left;
      background: linear-gradient(90deg, #6b9b2f, #b5d24a);
      transition: transform 0.25s linear;
    }

    &__controls {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      width: 100%;
      margin-top: 0.15rem;

      :deep(button) {
        width: 100%;
      }
    }
  }
</style>
