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
  youId: string | null
}>()

const emit = defineEmits<{ submit: [response: InteractionResponse] }>()

const chosenUid = ref<string | null>(null)
/** True once *this* client has locked in a choice (optimistic, before the
 *  next snapshot echoes it back in `interaction.answered`). */
const submitted = ref(false)

/** Which cards this prompt is asking about — own hand, or a supplied list. */
const choices = computed<Card[]>(() => {
  if (props.interaction.kind === 'simultaneous-choose-card') return props.hand
  return props.interaction.cards ?? []
})

/**
 * The server sends only a deadline, never how long the window was, so measure
 * the span once per prompt. That way the bar drains across the whole window
 * whatever timeout the card uses, instead of assuming a fixed length.
 */
const windowMs = ref(5000)

watch(
  () => props.interaction.id,
  () => {
    chosenUid.value = null
    submitted.value = false
    windowMs.value = Math.max(1000, props.interaction.deadline - Date.now())
  },
  { immediate: true },
)

/** Locked in once we've submitted locally or the server has recorded us. */
const hasSubmitted = computed(
  () => submitted.value || (props.youId != null && props.interaction.answered.includes(props.youId)),
)

/**
 * Garbage Collection: tapping a card IS the confirmation (no "Xác nhận"
 * button), and you may switch to another card right up to the deadline.
 * Every other prompt keeps the pick-then-confirm flow.
 */
const instantSelect = computed(() => props.interaction.kind === 'simultaneous-choose-card')

/** Everyone who must answer, with a tick for those who already did. */
const roster = computed(() =>
  props.interaction.requiredFrom.map((id) => {
    const player = props.players.find((p) => p.id === id)
    const done =
      props.interaction.answered.includes(id) ||
      // Optimistic self-tick: show my own tick the instant I tap, before the
      // next snapshot echoes it back.
      (instantSelect.value && id === props.youId && chosenUid.value != null)
    return {
      id,
      nickname: player?.nickname ?? '—',
      avatarId: player?.avatarId ?? null,
      done,
    }
  }),
)

const waitingOn = computed(() => roster.value.filter((p) => !p.done).map((p) => p.nickname))

const { remaining, fraction } = useCountdown(
  () => props.interaction.deadline,
  () => windowMs.value,
)

function onCardClick(uid: string) {
  if (instantSelect.value) {
    if (uid === chosenUid.value) return // can't deselect — only switch to another card
    chosenUid.value = uid
    emit('submit', { type: 'card', uid })
  } else if (!hasSubmitted.value) {
    chosenUid.value = uid
  }
}

function submit() {
  if (chosenUid.value && !hasSubmitted.value) {
    emit('submit', { type: 'card', uid: chosenUid.value })
    submitted.value = true
  }
}

const canSubmit = computed(() => Boolean(chosenUid.value))
</script>

<template>
  <div class="backdrop">
    <section class="dialog panel" role="dialog" aria-modal="true">
      <h2>{{ interaction.prompt }}</h2>

      <!-- Shared countdown so everyone sees the same clock -->
      <div v-if="remaining !== null" class="clock" :class="{ urgent: remaining <= 2 }">
        <span class="clock-track"><span class="clock-fill" :style="{ transform: `scaleX(${fraction})` }" /></span>
        <span class="clock-text">{{ remaining }}s</span>
      </div>

      <div class="body">
        <!-- Left: who must answer, ticked as they submit -->
        <aside class="roster">
          <div v-for="p in roster" :key="p.id" class="roster-row" :class="{ done: p.done }">
            <PlayerAvatar :avatar-id="p.avatarId" :size="34" :name="null" />
            <span class="rname">{{ p.nickname }}</span>
            <Icon v-if="p.done" name="lucide:circle-check" class="tick" aria-hidden="true" />
            <span v-else class="mini-spinner" aria-hidden="true" />
          </div>
        </aside>

        <!-- Right: pick a card (yours), or wait for the others -->
        <div class="main">
          <template v-if="interaction.isForYou">
            <div class="choices">
              <button
                v-for="card in choices"
                :key="card.uid"
                class="choice"
                :disabled="!instantSelect && hasSubmitted"
                @click="onCardClick(card.uid)"
              >
                <CardImage
                  :card-id="card.id"
                  :uid="card.uid"
                  width="112px"
                  :selected="chosenUid === card.uid"
                  :disabled="!instantSelect && hasSubmitted && chosenUid !== card.uid"
                />
              </button>
              <p v-if="!choices.length" class="muted">Không có lá bài nào để chọn.</p>
            </div>

            <!-- Instant-select (Garbage Collection): tap = confirm, no button -->
            <template v-if="instantSelect">
              <p v-if="chosenUid" class="muted submitted-note">Chạm lá khác để đổi lựa chọn.</p>
              <p v-else class="muted">Chạm 1 lá bài để chọn.</p>
            </template>
            <!-- Everyone else: pick then confirm -->
            <template v-else>
              <button v-if="!hasSubmitted" class="primary" :disabled="!canSubmit" @click="submit">
                Xác nhận
              </button>
              <p v-else class="muted submitted-note">Đã chọn — đang chờ người khác…</p>
            </template>
          </template>

          <template v-else>
            <p class="muted">Đang chờ {{ waitingOn.join(', ') || '…' }} chọn bài…</p>
            <div class="spinner" />
          </template>
        </div>
      </div>
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
  max-width: min(720px, 100%);
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

/* Countdown ------------------------------------------------------------- */
.clock {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.clock-track {
  flex: 1;
  height: 6px;
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

.clock-text {
  font-family: var(--font-display);
  font-size: 0.85rem;
  letter-spacing: 1px;
  color: var(--ink-dim);
  font-variant-numeric: tabular-nums;
  min-width: 2.2ch;
  text-align: right;
}

.clock.urgent .clock-text {
  color: #a5201a;
}

.clock.urgent .clock-fill {
  background: linear-gradient(90deg, #a5201a, var(--bad));
}

/* Two-column body ------------------------------------------------------- */
.body {
  display: flex;
  gap: 1.1rem;
  align-items: stretch;
}

.roster {
  flex: 0 0 auto;
  min-width: 150px;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-right: 1.1rem;
  border-right: 1px solid rgb(120 95 55 / 25%);
}

.roster-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.roster-row.done {
  opacity: 1;
}

.rname {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tick {
  color: var(--good);
  font-size: 1.15rem;
  flex: 0 0 auto;
}

.mini-spinner {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  border: 2px solid rgb(120 95 55 / 30%);
  border-top-color: var(--ink-dim);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
  justify-content: center;
  text-align: center;
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

.choice:disabled {
  cursor: default;
}

.choice:hover:not(:disabled) {
  filter: none;
}

.choice:active:not(:disabled) {
  transform: none;
}

.choice:hover:not(:disabled) :deep(.card) {
  transform: translateY(-6px) scale(1.175);
  z-index: 10;
}

.submitted-note {
  font-weight: 600;
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

@media (max-width: 560px) {
  .body {
    flex-direction: column;
  }

  .roster {
    flex-direction: row;
    flex-wrap: wrap;
    min-width: 0;
    padding-right: 0;
    padding-bottom: 0.8rem;
    border-right: none;
    border-bottom: 1px solid rgb(120 95 55 / 25%);
  }

  .roster-row {
    flex: 0 0 auto;
  }

  .rname {
    max-width: 90px;
  }
}
</style>
