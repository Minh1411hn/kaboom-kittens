<script setup lang="ts">
import type { Card } from '#shared/types/game'
import { CARD_CATALOG } from '#shared/types/game'

defineProps<{
  cards: Card[]
}>()

defineEmits<{
  close: []
}>()

function cardName(id: string): string {
  return CARD_CATALOG.find((c) => c.id === id)?.name ?? id
}
</script>

<template>
  <div class="backdrop" @click.self="$emit('close')">
    <section class="dialog panel" role="dialog" aria-modal="true">
      <header class="dialog-header">
        <h2>Nhìn thấu tương lai (See the Future)</h2>
        <p class="subtitle">Thứ tự các lá bài trên đầu chồng bài rút:</p>
      </header>

      <div class="choices">
        <div
          v-for="(card, index) in cards"
          :key="card.uid || index"
          class="choice-item"
        >
          <span class="card-rank">
            {{ index === 0 ? 'Top #1 (Trên cùng)' : `#${index + 1}` }}
          </span>
          <div class="card-wrapper">
            <CardImage :card-id="card.id" :uid="card.uid" width="112px" />
          </div>
          <span class="card-label">{{ cardName(card.id) }}</span>
        </div>
        <p v-if="!cards.length" class="muted">Không có lá bài nào.</p>
      </div>

      <footer class="dialog-footer">
        <button type="button" class="primary" @click="$emit('close')">
          Đã rõ
        </button>
      </footer>
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
  animation: backdrop-fade 0.2s ease;
}

.dialog {
  position: relative;
  max-width: min(640px, 100%);
  max-height: 86vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  padding: 1.5rem 1.8rem;
  text-align: center;
}

.dialog-header h2 {
  font-size: 1.4rem;
  line-height: 1.2;
  margin: 0;
}

.subtitle {
  margin: 0.35rem 0 0;
  font-size: 0.95rem;
  color: var(--text-dim);
}

.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
  align-items: flex-start;
  padding: 0.5rem 0;
}

.choice-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
}

.card-wrapper {
  border-radius: var(--card-radius);
  transition: transform 0.15s ease;
}

.card-wrapper:hover {
  transform: translateY(-4px);
}

.card-rank {
  font-family: var(--font-display);
  font-size: 0.8rem;
  color: var(--accent, #f5771c);
  letter-spacing: 0.5px;
  font-weight: bold;
}

.card-label {
  font-size: 0.85rem;
  color: var(--text-dim);
  max-width: 112px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dialog-footer {
  display: flex;
  justify-content: center;
  margin-top: 0.2rem;
}

@keyframes backdrop-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
