<template lang="pug">
figure.card(
  :aria-label="label"
  :class="{ 'card--selected': selected, 'card--disabled': disabled }"
  :style="{ width }"
  :title="title"
)
  img.card__image(:alt="label" :src="src" decoding="async" draggable="false" loading="lazy")
</template>

<script setup lang="ts">
  import type { CardId } from "#shared/types/game"

  const props = withDefaults(
    defineProps<{
      cardId?: CardId | null
      uid?: string
      /** Render the back regardless — used for opponents' hands and the deck. */
      faceDown?: boolean
      width?: string
      selected?: boolean
      disabled?: boolean
      reason?: string
    }>(),
    { width: "140px", faceDown: false, selected: false, disabled: false }
  )

  /**
   * Artwork is the whole card face — border, title and rules text are printed
   * into the 140x195 image — so this component adds no chrome of its own. That
   * also keeps a face-down card's identity out of the DOM entirely: the card id
   * must never reach a viewer who is only allowed to see a back.
   */
  const src = computed(() => (props.faceDown || !props.cardId ? cardBackUrl() : cardArtUrl(props.cardId, props.uid)))
  const label = computed(() => (props.faceDown || !props.cardId ? "Lá bài úp" : cardName(props.cardId)))
  const title = computed(() => {
    if (props.reason) return props.reason
    if (props.faceDown || !props.cardId) return ""
    return `${cardName(props.cardId)} — ${cardText(props.cardId)}`
  })
</script>

<style scoped lang="scss">
  .card {
    margin: 0;
    aspect-ratio: var(--card-ratio);
    border-radius: var(--card-radius);
    overflow: hidden;
    /* Shows through while the artwork loads, and behind its rounded corners. */
    background: var(--bg-inset);
    box-shadow: var(--shadow-sm);
    flex: 0 0 auto;
    transition:
      transform 0.12s ease,
      box-shadow 0.12s ease,
      filter 0.12s ease;

    &__image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    &--selected {
      outline: 3px solid var(--warn);
      outline-offset: 1px;
      box-shadow:
        0 0 18px rgb(255 194 26 / 55%),
        var(--shadow);
      transform: translateY(-10px);
    }

    &--disabled {
      filter: grayscale(0.7) brightness(0.85);
    }
  }
</style>
