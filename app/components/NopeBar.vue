<script setup lang="ts">
import type { PendingAction, PublicPlayer } from '#shared/types/game'

const props = defineProps<{
  stack: PendingAction[]
  deadline: number
  players: PublicPlayer[]
  hasNope: boolean
  /** You cannot Nope the card sitting on top if you are the one who played it. */
  youPlayedTop: boolean
  passed: boolean
}>()

defineEmits<{ nope: []; pass: [] }>()

const { remaining, fraction } = useCountdown(() => props.deadline)

const nameOf = (id: string) => props.players.find((p) => p.id === id)?.nickname ?? 'Someone'

const summary = computed(() => {
  const base = props.stack[0]
  if (!base) return ''
  const nopes = props.stack.length - 1
  const action = base.combo ? 'a cat combo' : cardName(base.cardId)
  if (!nopes) return `${nameOf(base.playerId)} played ${action}.`
  const verdict = nopes % 2 === 1 ? 'It is Noped' : 'The Nopes cancel out'
  return `${nameOf(base.playerId)} played ${action} · ${nopes} Nope${nopes === 1 ? '' : 's'} · ${verdict}.`
})
</script>

<template>
  <div class="nope-bar" role="status">
    <div class="fill" :style="{ transform: `scaleX(${fraction})` }" />

    <div class="content">
      <div class="stack">
        <CardImage
          v-for="(action, i) in stack"
          :key="action.id + i"
          :card-id="action.cardId"
          width="52px"
        />
      </div>

      <div class="text">
        <strong>{{ summary }}</strong>
        <span class="muted">{{ remaining }}s to respond</span>
      </div>

      <div class="actions">
        <button
          v-if="hasNope && !youPlayedTop"
          class="danger"
          @click="$emit('nope')"
        >
          NOPE!
        </button>
        <button v-if="hasNope && !youPlayedTop" :disabled="passed" @click="$emit('pass')">
          {{ passed ? 'Passed' : 'Pass' }}
        </button>
        <span v-else class="muted small">Waiting…</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nope-bar {
  position: relative;
  overflow: hidden;
  background: linear-gradient(180deg, #f8ecd2, var(--parchment) 45%, var(--parchment-2));
  border-radius: 16px;
  box-shadow: 0 0 0 4px rgb(232 53 46 / 55%), 0 18px 40px rgb(20 8 0 / 60%);
  color: var(--ink);
}

/* Drains left to right as the window closes. */
.fill {
  position: absolute;
  inset: 0;
  transform-origin: left;
  background: linear-gradient(90deg, rgb(232 53 46 / 26%), rgb(245 119 28 / 10%));
  transition: transform 0.25s linear;
}

.content {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.7rem 1rem;
  flex-wrap: wrap;
}

.stack {
  display: flex;
}

.stack :deep(.card:not(:first-child)) {
  margin-left: -26px;
}

.text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 200px;
  font-size: 0.95rem;
}

.text strong {
  font-family: var(--font-display);
  font-size: 1.05rem;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  line-height: 1.15;
}

.text .muted {
  color: var(--ink-dim);
  font-variant-numeric: tabular-nums;
}

.actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.actions .muted {
  color: var(--ink-dim);
}

.small {
  font-size: 0.85rem;
}
</style>
