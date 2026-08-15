<script setup lang="ts">
import type { CardId, ComboKind, PublicPlayer } from '#shared/types/game'
import { CARD_CATALOG } from '#shared/types/game'
import { seatColors } from '~/composables/useSeatStyle'

const props = defineProps<{
  players: PublicPlayer[]
  youId?: string
  combo?: ComboKind | null
  cardId?: CardId | null
  needsNamedCard?: boolean
  initialTargetId?: string | null
  initialNamedCardId?: CardId | null
}>()

const emit = defineEmits<{
  confirm: [targetId: string, namedCardId?: CardId]
  cancel: []
}>()

const selectedTargetId = ref<string | null>(props.initialTargetId ?? null)
const selectedNamedCardId = ref<CardId | null>(props.initialNamedCardId ?? null)
const searchCardQuery = ref('')

const isCatPair = computed(() => props.combo === 'pair')
const isCatTriple = computed(() => props.combo === 'triple')
const isFavor = computed(() => props.cardId === 'favor')
const isTargetedAttack = computed(() => props.cardId === 'targeted-attack-2x')

const title = computed(() => {
  if (isCatPair.value) return 'Cướp 1 lá bài ngẫu nhiên'
  if (isCatTriple.value) return 'Đòi 1 lá bài cụ thể'
  if (isFavor.value) return 'Yêu cầu đối thủ tặng bài'
  if (isTargetedAttack.value) return 'Tấn công có chủ đích'
  return 'Chọn đối thủ mục tiêu'
})

const subtitle = computed(() => {
  if (isCatPair.value) return 'Chọn đối thủ bạn muốn cướp bài ngẫu nhiên:'
  if (isCatTriple.value) return 'Chọn đối thủ và loại lá bài bạn muốn đòi:'
  if (isFavor.value) return 'Chọn người chơi phải đưa cho bạn 1 lá bài tự chọn:'
  if (isTargetedAttack.value) return 'Chọn người chơi phải nhận 2 lượt đi tiếp theo:'
  return 'Chọn một người chơi để thi triển lá bài:'
})

/**
 * Filter eligible targets: alive, not self, and for stealing/favor cards, must have cards in hand.
 */
const targetablePlayers = computed(() => {
  return props.players.filter((p) => {
    if (!p.alive || p.id === props.youId) return false
    if (!isTargetedAttack.value && p.handCount <= 0) return false
    return true
  })
})

function initials(nickname: string): string {
  return nickname
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function getSeatBg(seat: number, alive: boolean) {
  const colors = seatColors(seat, alive)
  return {
    backgroundColor: colors.base,
    borderColor: colors.light,
  }
}

const cardOptions = computed(() => {
  const query = searchCardQuery.value.trim().toLowerCase()
  return CARD_CATALOG.filter((c) => {
    if (c.id === 'exploding-kitten') return false
    if (!query) return true
    return c.name.toLowerCase().includes(query) || c.label.toLowerCase().includes(query)
  })
})

const canConfirm = computed(() => {
  if (!selectedTargetId.value) return false
  if (props.needsNamedCard && !selectedNamedCardId.value) return false
  return true
})

function confirm() {
  if (!canConfirm.value || !selectedTargetId.value) return
  emit('confirm', selectedTargetId.value, selectedNamedCardId.value ?? undefined)
}
</script>

<template>
  <div class="backdrop" @click.self="$emit('cancel')">
    <section class="dialog panel" role="dialog" aria-modal="true">
      <header class="dialog-header">
        <h2>{{ title }}</h2>
        <p class="subtitle">{{ subtitle }}</p>
      </header>

      <div class="target-section">
        <label class="section-label">Danh sách đối thủ:</label>
        <div v-if="targetablePlayers.length" class="target-grid">
          <button
            v-for="p in targetablePlayers"
            :key="p.id"
            type="button"
            class="target-card"
            :class="{ selected: selectedTargetId === p.id }"
            @click="selectedTargetId = p.id"
          >
            <div class="avatar" :style="getSeatBg(p.seat, p.alive)">
              {{ p.alive ? initials(p.nickname) : '💀' }}
            </div>
            <div class="target-info">
              <strong class="name">{{ p.nickname }}</strong>
              <span class="count">{{ p.handCount }} lá bài</span>
            </div>
            <span v-if="selectedTargetId === p.id" class="check-icon" aria-hidden="true">✓</span>
          </button>
        </div>
        <p v-else class="empty-notice">Không có đối thủ nào khả dụng để cướp bài.</p>
      </div>

      <!-- Demand specific card section for Triple Cat combo -->
      <div v-if="needsNamedCard" class="demand-section">
        <div class="demand-header">
          <label class="section-label">Chọn loại lá bài muốn đòi:</label>
          <input
            v-model="searchCardQuery"
            type="search"
            placeholder="Tìm kiếm loại bài..."
            class="search-input"
          >
        </div>

        <div class="cards-grid">
          <button
            v-for="card in cardOptions"
            :key="card.id"
            type="button"
            class="card-choice-btn"
            :class="{ selected: selectedNamedCardId === card.id }"
            :title="`${card.name}: ${card.text}`"
            @click="selectedNamedCardId = card.id"
          >
            <CardImage :card-id="card.id" width="76px" />
            <span class="card-title">{{ card.name }}</span>
          </button>
        </div>
      </div>

      <footer class="dialog-actions">
        <button type="button" class="cancel-btn" @click="$emit('cancel')">
          Hủy bỏ
        </button>
        <button
          type="button"
          class="primary confirm-btn"
          :disabled="!canConfirm"
          @click="confirm"
        >
          {{ isCatTriple ? 'Đòi bài' : 'Cướp bài' }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgb(20 8 0 / 72%);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  z-index: 25;
  padding: 1rem;
  animation: backdrop-fade 0.2s ease;
}

.dialog {
  max-width: min(640px, 95vw);
  max-height: 88vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
  padding: 1.5rem 1.65rem;
  background: rgba(32, 10, 8, 0.95);
  border: 1px solid rgba(255, 194, 26, 0.35);
  border-radius: 20px;
  box-shadow:
    0 24px 50px rgba(0, 0, 0, 0.7),
    0 0 30px rgba(255, 122, 26, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
  color: var(--text);
  animation: dialog-pop 0.25s cubic-bezier(0.2, 0.9, 0.3, 1);
}

.dialog-header {
  text-align: center;
}

.dialog-header h2 {
  font-size: 1.45rem;
  margin: 0 0 0.3rem;
  color: var(--accent);
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.subtitle {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-dim);
}

.section-label {
  display: block;
  font-family: var(--font-display);
  font-size: 0.82rem;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 0.5rem;
}

.target-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.65rem;
}

.target-card {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.6rem 0.75rem;
  background: rgb(60 25 15 / 55%);
  border: 2px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  cursor: pointer;
  position: relative;
  text-align: left;
  transition: all 0.15s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.target-card:hover {
  background: rgb(90 38 20 / 70%);
  border-color: rgba(255, 194, 26, 0.5);
  transform: translateY(-2px);
}

.target-card.selected {
  background: rgb(110 45 20 / 90%);
  border-color: var(--warn);
  box-shadow:
    0 0 16px rgba(255, 194, 26, 0.45),
    0 4px 10px rgba(0, 0, 0, 0.4);
}

.avatar {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid transparent;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

.target-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.target-info .name {
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
}

.target-info .count {
  font-size: 0.76rem;
  color: var(--text-dim);
}

.check-icon {
  position: absolute;
  top: 6px;
  right: 8px;
  font-weight: bold;
  color: var(--warn);
  font-size: 1rem;
}

.empty-notice {
  text-align: center;
  color: var(--text-dim);
  padding: 1rem;
  margin: 0;
}

/* Demand specific card grid */
.demand-section {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  border-top: 1px dashed rgba(255, 255, 255, 0.15);
  padding-top: 0.85rem;
}

.demand-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.search-input {
  padding: 0.3rem 0.6rem;
  font-size: 0.82rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.35);
  color: var(--text);
  width: 170px;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 0.5rem;
  max-height: 220px;
  overflow-y: auto;
  padding: 0.35rem 0.2rem;
}

.card-choice-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.25rem;
  background: rgba(40, 15, 10, 0.6);
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
}

.card-choice-btn:hover {
  background: rgba(80, 32, 18, 0.8);
  transform: translateY(-3px) scale(1.5);
  z-index: 10;
}

.card-choice-btn.selected {
  border-color: var(--warn);
  background: rgba(120, 50, 20, 0.9);
  box-shadow: 0 0 14px rgba(255, 194, 26, 0.4);
  transform: translateY(-4px);
}

.card-choice-btn.selected:hover {
  transform: translateY(-4px) scale(1.5);
  z-index: 10;
}

.card-title {
  font-size: 0.72rem;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
  color: var(--text);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 0.85rem;
}

.cancel-btn {
  padding: 0.5rem 1.1rem;
}

.confirm-btn {
  padding: 0.5rem 1.4rem;
  font-weight: 700;
  box-shadow: 0 4px 14px rgba(255, 122, 26, 0.4);
}

@keyframes backdrop-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes dialog-pop {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
