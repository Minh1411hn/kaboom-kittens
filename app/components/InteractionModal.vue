<script setup lang="ts">
import type { Card, InteractionResponse, PublicGameState } from '#shared/types/game'

/**
 * One component for every prompt in the game. It renders from the declarative
 * InteractionSpec the server sends, so adding a card that needs a new prompt
 * only means adding a branch here — never touching the table or the engine.
 */
const props = defineProps<{
  interaction: NonNullable<PublicGameState['interaction']>
  hand: Card[]
  players: PublicGameState['players']
}>()

const emit = defineEmits<{ submit: [response: InteractionResponse] }>()

const chosenUid = ref<string | null>(null)
const position = ref(0)

/** Which cards this prompt is asking about — own hand, or a supplied list. */
const choices = computed<Card[]>(() => {
  if (props.interaction.kind === 'simultaneous-choose-card') return props.hand
  return props.interaction.cards ?? []
})

watch(
  () => props.interaction.id,
  () => {
    chosenUid.value = null
    position.value = 0
  },
  { immediate: true },
)

const maxPosition = computed(() => props.interaction.maxPosition ?? 0)

const waitingOn = computed(() =>
  props.interaction.requiredFrom
    .filter((id) => !props.interaction.answered.includes(id))
    .map((id) => props.players.find((p) => p.id === id)?.nickname ?? '—'),
)

function submit() {
  const kind = props.interaction.kind
  if (kind === 'choose-deck-position') {
    emit('submit', { type: 'position', index: position.value })
    return
  }
  if (chosenUid.value) emit('submit', { type: 'card', uid: chosenUid.value })
}

const canSubmit = computed(() => {
  if (props.interaction.kind === 'choose-deck-position') return true
  return Boolean(chosenUid.value)
})

const positionLabel = computed(() => {
  if (position.value === 0) return 'the very top — the next player draws it'
  if (position.value >= maxPosition.value) return 'the very bottom'
  return `${position.value} card${position.value === 1 ? '' : 's'} down from the top`
})

/** Where the marker sits along the drawn deck edge, as a percentage. */
const markerLeft = computed(() =>
  maxPosition.value === 0 ? 0 : (position.value / maxPosition.value) * 100,
)
</script>

<template>
  <div class="backdrop">
    <section v-if="interaction.isForYou" class="dialog panel" role="dialog" aria-modal="true">
      <h2>{{ interaction.prompt }}</h2>

      <!-- Pick a card: from your hand, someone's hand, or the discard pile -->
      <div v-if="interaction.kind !== 'choose-deck-position'" class="choices">
        <button
          v-for="card in choices"
          :key="card.uid"
          class="choice"
          @click="chosenUid = card.uid"
        >
          <CardImage
            :card-id="card.id"
            :uid="card.uid"
            width="112px"
            :selected="chosenUid === card.uid"
          />
        </button>
        <p v-if="!choices.length" class="muted">Nothing to choose from.</p>
      </div>

      <!-- Slide the defused kitten back into the deck -->
      <div v-else class="position">
        <!-- The deck seen edge-on, with the kitten about to be pushed in. -->
        <div class="deck-edge" aria-hidden="true">
          <span class="edge-end">Top</span>
          <span class="slices">
            <span v-for="n in 18" :key="n" class="slice" />
            <span class="marker" :style="{ left: `${markerLeft}%` }">💥</span>
          </span>
          <span class="edge-end">Bottom</span>
        </div>

        <input v-model.number="position" type="range" min="0" :max="maxPosition" class="slider" />
        <p>
          Put it <strong>{{ positionLabel }}</strong>
        </p>
        <div class="quick">
          <button @click="position = 0">Top</button>
          <button @click="position = Math.floor(maxPosition / 2)">Middle</button>
          <button @click="position = maxPosition">Bottom</button>
        </div>
        <p class="muted small">Nobody else sees where you put it.</p>
      </div>

      <button class="primary" :disabled="!canSubmit" @click="submit">Confirm</button>
    </section>

    <!-- Bystanders just see who everyone is waiting on -->
    <section v-else class="dialog panel waiting">
      <h2>{{ interaction.prompt }}</h2>
      <p class="muted">Waiting for {{ waitingOn.join(', ') || '…' }}</p>
      <div class="spinner" />
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgb(20 8 0 / 68%);
  backdrop-filter: blur(3px);
  display: grid;
  place-items: center;
  z-index: 20;
  padding: 1rem;
}

.dialog {
  max-width: min(620px, 100%);
  max-height: 86vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.3rem 1.5rem;
}

.dialog h2 {
  text-align: center;
  font-size: 1.4rem;
  line-height: 1.15;
}

.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  justify-content: center;
}

.choice {
  padding: 0;
  border: none;
  background: none;
  box-shadow: none;
  border-radius: var(--card-radius);
  position: relative;
}

.choice:hover:not(:disabled) {
  filter: none;
}

.choice:active:not(:disabled) {
  transform: none;
}

.choice:hover :deep(.card) {
  transform: translateY(-6px) scale(1.5);
  z-index: 10;
}

.position {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  align-items: center;
  text-align: center;
}

/* The draw pile viewed edge-on so the slider has something to point at. */
.deck-edge {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
}

.edge-end {
  font-family: var(--font-display);
  font-size: 0.72rem;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--ink-dim);
}

.slices {
  position: relative;
  flex: 1;
  display: flex;
  gap: 2px;
  height: 46px;
  padding: 0 4px;
}

.slice {
  flex: 1;
  border-radius: 2px;
  background: linear-gradient(180deg, #f5771c, #c31d1f);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 30%);
}

.marker {
  position: absolute;
  top: -6px;
  transform: translateX(-50%);
  font-size: 1.15rem;
  filter: drop-shadow(0 2px 3px rgb(0 0 0 / 45%));
  transition: left 0.12s ease;
}

.slider {
  width: 100%;
  padding: 0;
  accent-color: var(--bad);
  box-shadow: none;
  border: none;
  background: none;
}

.quick {
  display: flex;
  gap: 0.5rem;
}

.waiting {
  align-items: center;
  text-align: center;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 4px solid rgb(120 95 55 / 30%);
  border-top-color: var(--bad);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

.small {
  font-size: 0.85rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
