<script setup lang="ts">
import {
  CARD_CATALOG,
  DECK_COUNT_MAX,
  type CardId,
  type DeckOverrides,
  type PublicGameState,
} from '#shared/types/game'

const props = defineProps<{
  deck: PublicGameState['deck']
  isHost: boolean
}>()

const emit = defineEmits<{ update: [DeckOverrides] }>()

const open = ref(false)

/**
 * The server is the only source of truth for the counts, but +/- taps arrive
 * far faster than a round trip and the socket has a token bucket (25 burst,
 * 8/s refill). So taps accumulate into `draft` and are flushed once, and the
 * displayed number falls back to the snapshot the moment the draft clears.
 */
const draft = ref<DeckOverrides | null>(null)
let flushTimer: ReturnType<typeof setTimeout> | null = null

const counts = computed<Record<CardId, number>>(() => {
  if (!draft.value) return props.deck.counts
  return { ...props.deck.counts, ...draft.value }
})

const overrides = computed<DeckOverrides>(() => draft.value ?? props.deck.overrides)

const total = computed(() =>
  CARD_CATALOG.reduce((n, entry) => n + (counts.value[entry.id] ?? 0), 0),
)

const handSize = computed(() => props.deck.handSize)

// The kittens are what end a game; zero of them is legal but worth flagging.
const noKittens = computed(() => (counts.value['exploding-kitten'] ?? 0) === 0)

// Kittens and Defuses are held back from the deal, so only the rest can fill hands.
const dealable = computed(() =>
  CARD_CATALOG.reduce((n, entry) => (entry.deck.formula ? n : n + (counts.value[entry.id] ?? 0)), 0),
)

function schedule(next: DeckOverrides) {
  draft.value = next
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    const payload = draft.value
    draft.value = null
    if (payload) emit('update', payload)
  }, 300)
}

function setCount(id: CardId, value: number) {
  const clamped = Math.max(0, Math.min(DECK_COUNT_MAX, Math.round(value)))
  schedule({ ...overrides.value, [id]: clamped })
}

function bump(id: CardId, delta: number) {
  setCount(id, (counts.value[id] ?? 0) + delta)
}

function clearOne(id: CardId) {
  const next = { ...overrides.value }
  delete next[id]
  schedule(next)
}

function clearAll() {
  schedule({})
}

onBeforeUnmount(() => {
  if (flushTimer) clearTimeout(flushTimer)
})
</script>

<template>
  <section class="deck-settings">
    <header class="deck-head">
      <button class="toggle" :aria-expanded="open" @click="open = !open">
        <span class="chevron" :class="{ open }">▸</span>
        Bộ bài của phòng
      </button>
      <span class="summary">{{ total }} lá · chia {{ handSize + 1 }} lá mỗi người</span>
    </header>

    <div v-show="open" class="deck-body">
      <p class="muted small">
        Mỗi người được chia {{ handSize + 1 }} lá ({{ handSize }} lá ngẫu nhiên + 1 lá Gỡ bom).
        <template v-if="isHost">
          Chỉnh số lượng bên dưới — cấu hình này giữ nguyên cho mọi ván trong phòng.
        </template>
        <template v-else> Chỉ chủ phòng mới chỉnh được. </template>
      </p>

      <p v-if="noKittens" class="warn small">
        ⚠️ Không có lá Mèo nổ nào — ván đấu sẽ không thể kết thúc bằng cách nổ.
      </p>
      <p v-if="dealable < handSize * 2" class="warn small">
        ⚠️ Không đủ bài để chia — hãy tăng số lượng các lá thường lên.
      </p>

      <ul class="card-rows">
        <li v-for="entry in CARD_CATALOG" :key="entry.id" class="card-row">
          <!--
            The real artwork, not the catalog emoji: a card face is entirely
            artwork, so the picture is the only thing a player can recognise a
            card by. The five named cats share one art pool and differ only by
            which picture they are pinned to, which no emoji or name conveys.
          -->
          <CardImage :card-id="entry.id" width="30px" class="thumb" />
          <span class="name" :title="`${entry.name} — ${entry.text}`">
            {{ entry.label }}
            <span
              v-if="overrides[entry.id] != null"
              class="pinned"
              title="Chủ phòng đã chốt số lượng này"
              >đã chỉnh</span
            >
          </span>

          <template v-if="isHost">
            <div class="stepper">
              <button
                :aria-label="`Bớt một lá ${entry.label}`"
                :disabled="(counts[entry.id] ?? 0) <= 0"
                @click="bump(entry.id, -1)"
              >
                −
              </button>
              <input
                type="number"
                min="0"
                :max="DECK_COUNT_MAX"
                :value="counts[entry.id] ?? 0"
                :aria-label="`Số lá ${entry.label}`"
                @change="setCount(entry.id, Number(($event.target as HTMLInputElement).value))"
              />
              <button
                :aria-label="`Thêm một lá ${entry.label}`"
                :disabled="(counts[entry.id] ?? 0) >= DECK_COUNT_MAX"
                @click="bump(entry.id, 1)"
              >
                +
              </button>
            </div>
            <button
              class="reset-one"
              :disabled="overrides[entry.id] == null"
              title="Trả lá này về số lượng mặc định"
              @click="clearOne(entry.id)"
            >
              ↺
            </button>
          </template>
          <span v-else class="count">{{ counts[entry.id] ?? 0 }}</span>
        </li>
      </ul>

      <footer v-if="isHost" class="deck-foot">
        <button class="reset-all" @click="clearAll">Khôi phục toàn bộ mặc định</button>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.deck-settings {
  background: var(--bg-inset);
  border: 2px solid var(--maroon-edge);
  border-radius: var(--radius);
  padding: 0.6rem 0.75rem;
}

.deck-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0;
  font: inherit;
  color: var(--text);
  background: none;
  border: none;
  box-shadow: none;
  cursor: pointer;
}

.chevron {
  display: inline-block;
  transition: transform 0.15s ease;
}

.chevron.open {
  transform: rotate(90deg);
}

.summary {
  font-size: 0.85rem;
  color: var(--text-dim);
}

.deck-body {
  margin-top: 0.6rem;
}

.small {
  font-size: 0.8rem;
}

.muted {
  color: var(--text-dim);
}

.warn {
  margin: 0.35rem 0 0;
  color: var(--warn);
}

.card-rows {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.15rem 0.9rem;
  margin: 0.6rem 0 0;
  padding: 0;
  list-style: none;
}

.card-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.2rem 0;
}

/*
 * Two classes deep on purpose: this styles CardImage's own root element, and a
 * single `.thumb` would tie with its internal `.card` rule on specificity.
 */
.card-row .thumb {
  border-radius: 4px;
  box-shadow: none;
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 0.85rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pinned {
  padding: 0 0.3rem;
  margin-left: 0.3rem;
  font-size: 0.65rem;
  color: var(--ink);
  background: var(--warn);
  border-radius: 6px;
}

.count {
  min-width: 1.6rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.stepper button,
.reset-one {
  width: 1.6rem;
  height: 1.6rem;
  padding: 0;
  font-size: 0.9rem;
  line-height: 1;
  background: linear-gradient(180deg, var(--maroon-1), var(--maroon-2));
}

.stepper input {
  width: 2.8rem;
  padding: 0.1rem 0.2rem;
  font-size: 0.85rem;
  color: var(--text);
  text-align: center;
  background: var(--bg-inset);
  border: 1px solid var(--maroon-edge);
}

.reset-one:disabled,
.stepper button:disabled {
  opacity: 0.35;
  cursor: default;
}

.deck-foot {
  margin-top: 0.6rem;
}

.reset-all {
  font-size: 0.8rem;
  background: linear-gradient(180deg, var(--maroon-1), var(--maroon-2));
}
</style>
