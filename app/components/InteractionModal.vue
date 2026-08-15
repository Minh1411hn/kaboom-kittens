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

/** Which cards this prompt is asking about — own hand, or a supplied list. */
const choices = computed<Card[]>(() => {
  if (props.interaction.kind === 'simultaneous-choose-card') return props.hand
  return props.interaction.cards ?? []
})

watch(
  () => props.interaction.id,
  () => {
    chosenUid.value = null
  },
  { immediate: true },
)

const waitingOn = computed(() =>
  props.interaction.requiredFrom
    .filter((id) => !props.interaction.answered.includes(id))
    .map((id) => props.players.find((p) => p.id === id)?.nickname ?? '—'),
)

function submit() {
  if (chosenUid.value) emit('submit', { type: 'card', uid: chosenUid.value })
}

const canSubmit = computed(() => Boolean(chosenUid.value))
</script>

<template>
  <div class="backdrop">
    <section v-if="interaction.isForYou" class="dialog panel" role="dialog" aria-modal="true">
      <h2>{{ interaction.prompt }}</h2>

      <!-- Pick a card: from your hand, someone's hand, or the discard pile -->
      <div class="choices">
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
        <p v-if="!choices.length" class="muted">Không có lá bài nào để chọn.</p>
      </div>

      <button class="primary" :disabled="!canSubmit" @click="submit">Xác nhận</button>
    </section>

    <!-- Bystanders just see who everyone is waiting on -->
    <section v-else class="dialog panel waiting">
      <h2>{{ interaction.prompt }}</h2>
      <p class="muted">Đang chờ {{ waitingOn.join(', ') || '…' }} chọn bài…</p>
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
  transform: translateY(-6px) scale(1.35);
  z-index: 10;
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

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
