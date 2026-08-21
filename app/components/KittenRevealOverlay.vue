<template lang="pug">
.kitten-reveal(aria-hidden="true")
  .kitten-reveal__wrap
    .kitten-reveal__burst
    .kitten-reveal__glow
      CardImage(:uid="uid" card-id="exploding-kitten" width="min(350px, 82vw)")
    p.kitten-reveal__caption
      Icon(name="lucide:bomb")
      |
      | {{ caption }}
</template>

<script setup lang="ts">
  /**
   * The Exploding Kitten, held up in the middle of the table for everyone to see.
   *
   * Purely presentational — `useKittenCeremony` owns the timing and unmounts this
   * when the reveal is over. The same centre-stage treatment `CardArrivalFlyer`
   * gives a drawn card, turned red because this one is bad news.
   *
   * The kitten's real uid is redacted by `projectStateFor`, so the caller passes
   * a uid derived from the event `seq` — same value on every client, so the whole
   * table sees the same artwork.
   */
  const props = defineProps<{
    /** Derived from the `kitten-drawn` event seq, purely to pick artwork. */
    uid: string
    playerName: string
    /** Whether a Defuse is about to save them — changes the caption only. */
    defused: boolean
  }>()

  const { t } = useI18n()
  const caption = computed(() =>
    props.defused
      ? t("table.kitten_reveal.drew", { name: props.playerName })
      : t("table.kitten_reveal.exploded", { name: props.playerName })
  )
</script>

<style scoped lang="scss">
  .kitten-reveal {
    position: fixed;
    inset: 0;
    pointer-events: none;
    /* Above CardArrivalFlyer (30) — the kitten outranks everything. */
    z-index: 32;
    overflow: hidden;

    &__wrap {
      position: fixed;
      left: 50vw;
      top: 50vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      transform: translate(-50%, -50%) scale(1);
      backface-visibility: hidden;
      animation: kitten-reveal-pop 0.4s cubic-bezier(0.18, 0.9, 0.32, 1.2) both;

      :deep(img) {
        image-rendering: -webkit-optimize-contrast;
        image-rendering: crisp-edges;
      }
    }

    &__burst {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 620px;
      height: 620px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 75, 43, 0.55) 0%, rgba(180, 20, 10, 0.25) 50%, transparent 70%);
      z-index: -1;
      animation: kitten-burst 1.1s ease-out infinite;
    }

    &__glow {
      border-radius: var(--card-radius);
      box-shadow:
        0 0 45px rgba(255, 75, 43, 0.95),
        0 0 90px rgba(200, 30, 10, 0.65),
        0 35px 70px rgba(0, 0, 0, 0.88);
      animation: kitten-aura 0.75s ease-in-out infinite alternate;
    }

    &__caption {
      margin: 0;
      font-family: var(--font-display);
      font-size: clamp(1.1rem, 3.4vw, 1.6rem);
      letter-spacing: 0.5px;
      text-align: center;
      color: #ffe6df;
      text-shadow:
        0 2px 10px rgb(0 0 0 / 85%),
        0 0 22px rgba(255, 75, 43, 0.8);
    }
  }

  @keyframes kitten-reveal-pop {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.4) rotate(-7deg);
    }
    65% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.07) rotate(3deg);
    }
    100% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1) rotate(0deg);
    }
  }

  @keyframes kitten-aura {
    from {
      box-shadow:
        0 0 35px rgba(255, 75, 43, 0.8),
        0 0 65px rgba(200, 30, 10, 0.5),
        0 28px 50px rgba(0, 0, 0, 0.8);
    }
    to {
      box-shadow:
        0 0 60px rgba(255, 75, 43, 1),
        0 0 110px rgba(200, 30, 10, 0.85),
        0 40px 80px rgba(0, 0, 0, 0.95);
    }
  }

  @keyframes kitten-burst {
    0% {
      transform: translate(-50%, -50%) scale(0.8);
      opacity: 0.55;
    }
    50% {
      transform: translate(-50%, -50%) scale(1.18);
      opacity: 0.85;
    }
    100% {
      transform: translate(-50%, -50%) scale(1.35);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .kitten-reveal__wrap,
    .kitten-reveal__burst,
    .kitten-reveal__glow {
      animation: none;
    }
  }
</style>
