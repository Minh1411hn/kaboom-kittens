<template lang="pug">
section.deck-settings
  header.deck-settings__head
    button.deck-settings__toggle(:aria-expanded="open" @click="open = !open")
      span.deck-settings__chevron(:class="{ 'deck-settings__chevron--open': open, open }")
        Icon(aria-hidden="true" name="lucide:chevron-right")
      |
      | Bộ bài của phòng
    span.deck-settings__summary {{ total }} lá · chia {{ handSize + 1 }} lá mỗi người

  .deck-settings__body(v-show="open")
    p.deck-settings__info.muted.small
      | Mỗi người được chia {{ handSize + 1 }} lá ({{ handSize }} lá ngẫu nhiên + 1 lá Gỡ bom).
      |
      template(v-if="isHost")
        | Chỉnh số lượng bên dưới — cấu hình này giữ nguyên cho mọi ván trong phòng.
      template(v-else)
        | Chỉ chủ phòng mới chỉnh được.

    p.deck-settings__warn.warn.small(v-if="noKittens")
      Icon(aria-hidden="true" name="lucide:triangle-alert")
      |
      | Không có lá Mèo nổ nào — ván đấu sẽ không thể kết thúc bằng cách nổ.
    p.deck-settings__warn.warn.small(v-if="dealable < handSize * 2")
      Icon(aria-hidden="true" name="lucide:triangle-alert")
      |
      | Không đủ bài để chia — hãy tăng số lượng các lá thường lên.

    .deck-settings__groups
      .deck-settings__group
        h3.deck-settings__group-title Bom + Defuse
        ul.deck-settings__rows
          li.deck-settings__row(v-for="entry in bomDefuseGroup" :key="entry.id")
            CardImage.deck-settings__thumb(:card-id="entry.id" width="30px")
            span.deck-settings__name(:title="`${entry.name} — ${entry.text}`")
              | {{ entry.name }}
              span.deck-settings__pinned(v-if="overrides[entry.id] != null" title="Chủ phòng đã chốt số lượng này") đã chỉnh
            template(v-if="isHost")
              .deck-settings__stepper
                button.deck-settings__step-btn(
                  :aria-label="`Bớt một lá ${entry.name}`"
                  :disabled="(counts[entry.id] ?? 0) <= 0"
                  @click="bump(entry.id, -1)"
                )
                  Icon(aria-hidden="true" name="lucide:minus")
                input.deck-settings__step-input(
                  :aria-label="`Số lá ${entry.name}`"
                  :max="DECK_COUNT_MAX"
                  :value="counts[entry.id] ?? 0"
                  min="0"
                  type="number"
                  @change="setCount(entry.id, Number($event.target.value))"
                )
                button.deck-settings__step-btn(
                  :aria-label="`Thêm một lá ${entry.name}`"
                  :disabled="(counts[entry.id] ?? 0) >= DECK_COUNT_MAX"
                  @click="bump(entry.id, 1)"
                )
                  Icon(aria-hidden="true" name="lucide:plus")
              button.deck-settings__reset-one(
                :disabled="overrides[entry.id] == null"
                title="Trả lá này về số lượng mặc định"
                @click="clearOne(entry.id)"
              )
                Icon(aria-hidden="true" name="lucide:rotate-ccw")
            span.deck-settings__count(v-else) {{ counts[entry.id] ?? 0 }}

      .deck-settings__group
        h3.deck-settings__group-title Chức năng
        ul.deck-settings__rows
          li.deck-settings__row(v-for="entry in actionGroup" :key="entry.id")
            CardImage.deck-settings__thumb(:card-id="entry.id" width="30px")
            span.deck-settings__name(:title="`${entry.name} — ${entry.text}`")
              | {{ entry.name }}
              span.deck-settings__pinned(v-if="overrides[entry.id] != null" title="Chủ phòng đã chốt số lượng này") đã chỉnh
            template(v-if="isHost")
              .deck-settings__stepper
                button.deck-settings__step-btn(
                  :aria-label="`Bớt một lá ${entry.name}`"
                  :disabled="(counts[entry.id] ?? 0) <= 0"
                  @click="bump(entry.id, -1)"
                )
                  Icon(aria-hidden="true" name="lucide:minus")
                input.deck-settings__step-input(
                  :aria-label="`Số lá ${entry.name}`"
                  :max="DECK_COUNT_MAX"
                  :value="counts[entry.id] ?? 0"
                  min="0"
                  type="number"
                  @change="setCount(entry.id, Number($event.target.value))"
                )
                button.deck-settings__step-btn(
                  :aria-label="`Thêm một lá ${entry.name}`"
                  :disabled="(counts[entry.id] ?? 0) >= DECK_COUNT_MAX"
                  @click="bump(entry.id, 1)"
                )
                  Icon(aria-hidden="true" name="lucide:plus")
              button.deck-settings__reset-one(
                :disabled="overrides[entry.id] == null"
                title="Trả lá này về số lượng mặc định"
                @click="clearOne(entry.id)"
              )
                Icon(aria-hidden="true" name="lucide:rotate-ccw")
            span.deck-settings__count(v-else) {{ counts[entry.id] ?? 0 }}

      .deck-settings__group
        h3.deck-settings__group-title Normal Cat
        ul.deck-settings__rows
          li.deck-settings__row(v-for="entry in catGroup" :key="entry.id")
            CardImage.deck-settings__thumb(:card-id="entry.id" width="30px")
            span.deck-settings__name(:title="`${entry.name} — ${entry.text}`")
              | {{ entry.name }}
              span.deck-settings__pinned(v-if="overrides[entry.id] != null" title="Chủ phòng đã chốt số lượng này") đã chỉnh
            template(v-if="isHost")
              .deck-settings__stepper
                button.deck-settings__step-btn(
                  :aria-label="`Bớt một lá ${entry.name}`"
                  :disabled="(counts[entry.id] ?? 0) <= 0"
                  @click="bump(entry.id, -1)"
                )
                  Icon(aria-hidden="true" name="lucide:minus")
                input.deck-settings__step-input(
                  :aria-label="`Số lá ${entry.name}`"
                  :max="DECK_COUNT_MAX"
                  :value="counts[entry.id] ?? 0"
                  min="0"
                  type="number"
                  @change="setCount(entry.id, Number($event.target.value))"
                )
                button.deck-settings__step-btn(
                  :aria-label="`Thêm một lá ${entry.name}`"
                  :disabled="(counts[entry.id] ?? 0) >= DECK_COUNT_MAX"
                  @click="bump(entry.id, 1)"
                )
                  Icon(aria-hidden="true" name="lucide:plus")
              button.deck-settings__reset-one(
                :disabled="overrides[entry.id] == null"
                title="Trả lá này về số lượng mặc định"
                @click="clearOne(entry.id)"
              )
                Icon(aria-hidden="true" name="lucide:rotate-ccw")
            span.deck-settings__count(v-else) {{ counts[entry.id] ?? 0 }}

    footer.deck-settings__foot(v-if="isHost")
      button.deck-settings__reset-all(@click="clearAll") Khôi phục toàn bộ mặc định
</template>

<script setup lang="ts">
  import {
    CARD_CATALOG,
    DECK_COUNT_MAX,
    type CardId,
    type DeckOverrides,
    type PublicGameState
  } from "#shared/types/game"

  const props = defineProps<{
    deck: PublicGameState["deck"]
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

  const bomDefuseGroup = computed(() => CARD_CATALOG.filter((c) => c.category === "kitten" || c.category === "defuse"))
  const actionGroup = computed(() => CARD_CATALOG.filter((c) => c.category === "action"))
  const catGroup = computed(() => CARD_CATALOG.filter((c) => c.category === "cat"))

  const total = computed(() => CARD_CATALOG.reduce((n, entry) => n + (counts.value[entry.id] ?? 0), 0))

  const handSize = computed(() => props.deck.handSize)

  // The kittens are what end a game; zero of them is legal but worth flagging.
  const noKittens = computed(() => (counts.value["exploding-kitten"] ?? 0) === 0)

  // Kittens and Defuses are held back from the deal, so only the rest can fill hands.
  const dealable = computed(() =>
    CARD_CATALOG.reduce((n, entry) => (entry.deck.formula ? n : n + (counts.value[entry.id] ?? 0)), 0)
  )

  function schedule(next: DeckOverrides) {
    draft.value = next
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(() => {
      flushTimer = null
      const payload = draft.value
      draft.value = null
      if (payload) emit("update", payload)
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

<style scoped lang="scss">
  .deck-settings {
    background: $cream;
    border: $outline-width solid $ink;
    border-radius: var(--radius);
    padding: 0.6rem 0.75rem;

    &__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    &__toggle {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0;
      font: inherit;
      color: $ink;
      background: none;
      border: none;
      box-shadow: none;
      cursor: pointer;
    }

    &__chevron {
      display: inline-block;
      transition: transform 0.15s ease;

      &--open,
      &.open {
        transform: rotate(90deg);
      }
    }

    &__summary {
      font-size: 0.85rem;
      color: var(--text-dim);
    }

    &__body {
      margin-top: 0.6rem;
    }

    &__info {
      // inherits .muted .small
    }

    &__warn {
      margin: 0.35rem 0 0;
      color: var(--warn);
    }

    &__groups {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      margin-top: 1rem;
    }

    &__group {
      // group container
    }

    &__group-title {
      font-size: 1rem;
      color: $ink;
      margin: 0 0 0.5rem;
      border-bottom: 1px solid $ink;
      padding-bottom: 0.3rem;
    }

    &__rows {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    &__row {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.2rem 0;

      /*
     * Two classes deep on purpose: this styles CardImage's own root element, and a
     * single `.deck-settings__thumb` would tie with its internal `.card` rule on specificity.
     */
      .deck-settings__thumb {
        border-radius: 4px;
        box-shadow: none;
      }
    }

    &__thumb {
      border-radius: 4px;
      box-shadow: none;
    }

    &__name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      font-size: 0.85rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__pinned {
      padding: 0 0.3rem;
      margin-left: 0.3rem;
      font-size: 0.65rem;
      color: var(--ink);
      background: var(--warn);
      border-radius: 6px;
    }

    &__stepper {
      display: flex;
      align-items: center;
      gap: 0.2rem;
    }

    &__step-btn {
      width: 1.6rem;
      height: 1.6rem;
      padding: 0;
      font-size: 0.9rem;
      line-height: 1;
      background: linear-gradient(180deg, $brick-1, $brick-2);
      color: $cream;

      &:disabled {
        opacity: 0.35;
        cursor: default;
      }
    }

    &__step-input {
      width: 2.8rem;
      padding: 0.1rem 0.2rem;
      font-size: 0.85rem;
      color: $ink;
      text-align: center;
      background: $cream-card;
      border: 2px solid $ink;
    }

    &__reset-one {
      width: 1.6rem;
      height: 1.6rem;
      padding: 0;
      font-size: 0.9rem;
      line-height: 1;
      background: linear-gradient(180deg, $brick-1, $brick-2);
      color: $cream;

      &:disabled {
        opacity: 0.35;
        cursor: default;
      }
    }

    &__count {
      min-width: 1.6rem;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }

    &__foot {
      margin-top: 0.6rem;
    }

    &__reset-all {
      font-size: 0.8rem;
      background: linear-gradient(180deg, $brick-1, $brick-2);
      color: $cream;
    }
  }
</style>
