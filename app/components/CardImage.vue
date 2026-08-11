<script setup lang="ts">
import type { CardId } from '#shared/types/game'
import { CARD_BY_ID } from '#shared/types/game'

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
    /**
     * `frame` draws the paper card chrome (border, badge, label, title) around
     * the artwork; `plain` shows the image full-bleed. Backs are always plain.
     */
    variant?: 'frame' | 'plain'
  }>(),
  { width: '96px', faceDown: false, selected: false, disabled: false, variant: 'frame' },
)

const entry = computed(() => (props.cardId ? CARD_BY_ID[props.cardId] : null))

/**
 * A back has no identity to print. Forcing `plain` here is also what keeps the
 * face out of the DOM entirely — the card id must never reach a viewer who is
 * only allowed to see a back.
 */
const framed = computed(() => {
  if (props.variant !== 'frame' || props.faceDown || !entry.value || !props.cardId) return false
  return artVariantCount(props.cardId) === 1
})

const src = computed(() =>
  props.faceDown || !props.cardId ? cardBackUrl() : cardArtUrl(props.cardId, props.uid),
)
const label = computed(() =>
  props.faceDown || !props.cardId ? 'Face-down card' : cardName(props.cardId),
)
const title = computed(() => {
  if (props.reason) return props.reason
  if (props.faceDown || !props.cardId) return ''
  return `${cardName(props.cardId)} — ${cardText(props.cardId)}`
})
</script>

<template>
  <figure
    class="card"
    :class="{ selected, disabled, framed, plain: !framed }"
    :style="{ width, ...(framed ? { '--c': entry!.color } : {}) }"
    :title="title"
    :aria-label="label"
  >
    <template v-if="framed">
      <header class="card-head">
        <span class="card-badge" aria-hidden="true">{{ entry!.emoji }}</span>
        <span class="card-lines">
          <span class="card-label">{{ entry!.label }}</span>
          <strong class="card-title">{{ entry!.name }}</strong>
        </span>
      </header>
      <div class="card-art">
        <img :src="src" :alt="label" loading="lazy" decoding="async" draggable="false" />
      </div>
    </template>

    <img v-else :src="src" :alt="label" loading="lazy" decoding="async" draggable="false" />
  </figure>
</template>

<style scoped>
/*
 * `container-type` lets every dimension below be a share of the card's own
 * width, so one component reads correctly at 38px in the Nope stack and at
 * 150px in your hand without a size prop per call site.
 */
.card {
  container-type: inline-size;
  margin: 0;
  aspect-ratio: var(--card-ratio);
  border-radius: var(--card-radius);
  overflow: hidden;
  background: var(--card-paper);
  box-shadow: var(--shadow-sm);
  flex: 0 0 auto;
  transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
}

.card.plain {
  background: var(--bg-inset);
}

.card.plain img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.card.framed {
  display: flex;
  flex-direction: column;
  border: var(--card-border) solid var(--c);
  color: var(--card-ink);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 3cqw;
  padding: 4cqw 4cqw 2cqw;
  flex: 0 0 auto;
}

.card-badge {
  display: grid;
  place-items: center;
  width: 21cqw;
  height: 21cqw;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--c);
  font-size: 11cqw;
  line-height: 1;
}

.card-lines {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.05;
}

.card-label {
  font-family: var(--font-display);
  font-size: 7.2cqw;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--c);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-title {
  font-family: var(--font-display);
  font-size: 11cqw;
  font-weight: 700;
  letter-spacing: 0.2px;
  text-transform: uppercase;
  color: var(--card-ink);
  /* Long names wrap to two lines rather than shrinking the illustration. */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.card-art {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.card-art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Too small to read — drop to the illustration plus its coloured border. */
@container (max-width: 62px) {
  .card-head {
    display: none;
  }
}

.card.selected {
  outline: 3px solid var(--warn);
  outline-offset: 1px;
  box-shadow: 0 0 18px rgb(255 194 26 / 55%), var(--shadow);
  transform: translateY(-10px);
}

.card.disabled {
  filter: grayscale(0.7) brightness(0.85);
}
</style>
