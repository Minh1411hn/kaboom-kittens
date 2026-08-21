<template lang="pug">
.deck-position
  section.deck-position__panel.panel(aria-modal="true" role="dialog")
    h2.deck-position__title {{ $t('interactions.choose-deck-position') }}

    .deck-position__choices
      button.deck-position__slot(
        v-for="i in numberedPositions"
        :class="{ 'deck-position__slot--selected': !pickedByRandom && position === i }"
        :key="i"
        type="button"
        @click="pick(i)"
      ) {{ i + 1 }}
      button.deck-position__slot.deck-position__slot--wide(
        :class="{ 'deck-position__slot--selected': !pickedByRandom && position === maxPosition }"
        type="button"
        @click="pick(maxPosition)"
      ) {{ $t('table.deck_position.bottom_option') }}
      button.deck-position__slot.deck-position__slot--wide.deck-position__slot--random(
        :class="{ 'deck-position__slot--selected': pickedByRandom }"
        type="button"
        @click="pickRandom"
      )
        Icon(aria-hidden="true" name="lucide:dices")
        |
        | {{ $t('table.deck_position.random') }}

    p.deck-position__preview
      template(v-if="position !== null")
        | {{ $t('table.deck_position.preview_prefix') }}
        strong {{ positionLabel }}
      template(v-else) {{ $t('table.deck_position.preview_placeholder') }}
    p.deck-position__hint.muted {{ $t('table.deck_position.hint') }}

    button.deck-position__submit.primary(:disabled="!canSubmit" type="button" @click="submit") {{ $t('app.confirm') }}
</template>

<script setup lang="ts">
  import type { PublicGameState } from "#shared/types/game"

  /**
   * Where to put the Exploding Kitten back after Defuse. Carved out of
   * InteractionModal.vue the same way `reorder-cards` was carved out into
   * SeeFutureModal.vue — this only ever mounts for the player who must answer
   * (see `showDeckPositionModal` in app/pages/room/[id].vue), so there's no
   * bystander/waiting branch here.
   */
  const props = defineProps<{
    interaction: NonNullable<PublicGameState["interaction"]>
  }>()

  const emit = defineEmits<{ submit: [index: number] }>()

  const { t } = useI18n()

  // `null` means nothing picked yet — unlike the old slider (which defaulted
  // to "top" and let you confirm immediately), this makes an explicit choice
  // mandatory so a stray Confirm click can't silently bury the kitten on top.
  const position = ref<number | null>(null)
  // Tracks whether the current pick came from the RANDOM button, purely so it
  // can stay highlighted as the active choice — cleared the moment any other
  // button is picked instead.
  const pickedByRandom = ref(false)

  watch(
    () => props.interaction.id,
    () => {
      position.value = null
      pickedByRandom.value = false
    },
    { immediate: true }
  )

  function pick(index: number) {
    position.value = index
    pickedByRandom.value = false
  }

  const maxPosition = computed(() => props.interaction.maxPosition ?? 0)

  // Button "N" ↔ index N-1 (so "1" is the very top). Only offered while its
  // index is strictly below maxPosition — the index equal to maxPosition is
  // always the bottom, already covered by the "Đặt ở cuối" button, so hiding
  // it here avoids two buttons landing on the same slot once the draw pile
  // gets small.
  const numberedPositions = computed(() => [0, 1, 2, 3, 4].filter((i) => i < maxPosition.value))

  function pickRandom() {
    position.value = Math.floor(Math.random() * (maxPosition.value + 1))
    pickedByRandom.value = true
  }

  const positionLabel = computed(() => {
    if (position.value === null) return ""
    if (position.value === 0) return t("table.deck_position.top_label")
    if (position.value >= maxPosition.value) return t("table.deck_position.bottom_label")
    return t("table.deck_position.nth_from_top", { n: position.value })
  })

  const canSubmit = computed(() => position.value !== null)

  function submit() {
    if (position.value === null) return
    emit("submit", position.value)
  }
</script>

<style scoped lang="scss">
  .deck-position {
    position: fixed;
    inset: 0;
    background: rgb(20 8 0 / 68%);
    backdrop-filter: blur(3px);
    display: grid;
    place-items: center;
    z-index: 20;
    padding: 1rem;

    &__panel {
      max-width: min(480px, 100%);
      max-height: 86vh;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
      padding: 1.3rem 1.5rem;
      text-align: center;
    }

    &__title {
      font-size: 1.4rem;
      line-height: 1.15;
    }

    &__choices {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: center;
    }

    &__slot {
      min-width: 3rem;

      &--wide {
        min-width: auto;
      }

      &--selected {
        background: linear-gradient(180deg, #ffa02b, var(--accent) 45%, var(--accent-dim));
        color: #33180a;
        text-shadow: 0 1px 0 rgb(255 255 255 / 35%);
      }

      &--random {
        // random slot modifier
      }
    }

    &__preview {
      min-height: 1.4em;
    }

    &__hint {
      font-size: 0.85rem;
    }

    &__submit {
      // submit button modifier
    }
  }
</style>
