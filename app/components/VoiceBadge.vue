<template lang="pug">
component.voice-badge(
  :class="{ 'voice-badge--speaking': speaking && !muted, 'voice-badge--muted': muted, 'voice-badge--off': !micOn }"
  :is="interactive ? 'button' : 'span'"
  :title="muted ? 'Đang tắt tiếng người này — bấm để nghe lại' : !micOn ? 'Micro đang tắt' : interactive ? 'Bấm để tắt tiếng người này' : 'Micro đang bật'"
  :type="interactive ? 'button' : undefined"
  @click.stop="interactive && $emit('toggle')"
)
  Icon(:name="muted ? 'lucide:volume-x' : micOn ? 'lucide:volume-2' : 'lucide:mic-off'" aria-hidden="true")
</template>

<script setup lang="ts">
  /**
   * The speaker chip in the bottom-right corner of a player's avatar.
   *
   * It carries three separate readings at once, which is why it is one element
   * rather than three:
   *  - who is talking right now — the ring around it lights up;
   *  - whether their mic is live at all — a crossed-out mic when it is not;
   *  - whether I have silenced them for myself — a crossed-out speaker.
   *
   * Only other players' badges are interactive; your own is a read-out.
   */
  withDefaults(
    defineProps<{
      micOn: boolean
      speaking?: boolean
      muted?: boolean
      interactive?: boolean
    }>(),
    { speaking: false, muted: false, interactive: false }
  )

  defineEmits<{ toggle: [] }>()
</script>

<style scoped lang="scss">
  .voice-badge {
    display: grid;
    place-items: center;
    width: calc(var(--avatar-size, 62px) * 0.36);
    height: calc(var(--avatar-size, 62px) * 0.36);
    min-width: 16px;
    min-height: 16px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: rgb(30 12 0 / 88%);
    box-shadow:
      0 0 0 2px rgb(0 0 0 / 35%),
      0 2px 4px rgb(0 0 0 / 45%);
    font-size: calc(var(--avatar-size, 62px) * 0.2);
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    transition: box-shadow 120ms ease-out;

    @at-root button#{&} {
      cursor: pointer;

      &:hover {
        filter: brightness(1.2);
      }
    }

    /* The mic is published but switched off — present, just not listening. */
    &--off {
      opacity: 0.55;
    }

    &--muted {
      background: rgb(70 12 8 / 92%);
      box-shadow:
        0 0 0 2px var(--bad),
        0 2px 4px rgb(0 0 0 / 45%);
    }

    /* "Đang nói": the lit border the design calls for. */
    &--speaking {
      box-shadow:
        0 0 0 2px var(--good),
        0 0 10px 2px rgb(76 201 95 / 70%);
      animation: voice-pulse 1s ease-in-out infinite;

      @media (prefers-reduced-motion: reduce) {
        animation: none;
      }
    }
  }

  @keyframes voice-pulse {
    50% {
      box-shadow:
        0 0 0 3px var(--good),
        0 0 16px 4px rgb(76 201 95 / 90%);
    }
  }
</style>
