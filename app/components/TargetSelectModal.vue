<template lang="pug">
.target-select(@click.self="emit('cancel')")
  section.target-select__panel.panel(aria-modal="true" role="dialog")
    header.target-select__header
      h2.target-select__title {{ title }}
      p.target-select__subtitle {{ subtitle }}

    .target-select__section
      label.target-select__section-label {{ $t('table.target_select.opponent_list') }}
      .target-select__grid(v-if="targetablePlayers.length")
        button.target-select__player-card(
          v-for="p in targetablePlayers"
          :class="{ 'target-select__player-card--selected': selectedTargetId === p.id }"
          :key="p.id"
          type="button"
          @click="selectedTargetId = p.id"
        )
          PlayerAvatar(:alive="p.alive" :avatar-id="p.avatarId" :name="p.nickname" :size="40")
          .target-select__player-info
            span.target-select__card-count {{ $t('table.target_select.hand_count', { count: p.handCount }) }}
          span.target-select__check-icon(v-if="selectedTargetId === p.id" aria-hidden="true")
            Icon(name="lucide:check")
      p.target-select__empty(v-else) {{ $t('table.target_select.no_opponents') }}

    // Demand specific card section for Triple Cat combo
    .target-select__demand(v-if="needsNamedCard")
      .target-select__demand-header
        label.target-select__section-label {{ $t('table.target_select.choose_card_label') }}
        input.target-select__search-input(v-model="searchCardQuery" :placeholder="$t('table.target_select.search_placeholder')" type="search")

      .target-select__card-grid
        button.target-select__card-choice(
          v-for="card in cardOptions"
          :class="{ 'target-select__card-choice--selected': selectedNamedCardId === card.id }"
          :key="card.id"
          :title="`${card.name}: ${card.text}`"
          type="button"
          @click="selectedNamedCardId = card.id"
        )
          CardImage(:card-id="card.id" width="76px")
          span.target-select__card-name {{ card.name }}

    footer.target-select__actions
      button.target-select__cancel-btn(type="button" @click="emit('cancel')") {{ $t('table.target_select.cancel') }}
      button.target-select__confirm-btn.primary(:disabled="!canConfirm" type="button" @click="confirm")
        | {{ isCatTriple ? $t('table.target_select.confirm_demand') : isCatPair ? $t('table.target_select.confirm_steal') : isTargetedAttack ? $t('table.target_select.confirm_attack') : isFavor ? $t('table.target_select.confirm_favor') : $t('table.target_select.confirm_default') }}
</template>

<script setup lang="ts">
  import type { CardId, ComboKind, PublicPlayer } from "#shared/types/game"
  import { CARD_CATALOG } from "#shared/types/game"

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
  const searchCardQuery = ref("")

  const { t } = useI18n()
  const { cardName, cardLabel, cardText } = useCardText()

  const isCatPair = computed(() => props.combo === "pair")
  const isCatTriple = computed(() => props.combo === "triple")
  const isFavor = computed(() => props.cardId === "favor")
  const isTargetedAttack = computed(() => props.cardId === "targeted-attack-2x")

  const title = computed(() => {
    if (isCatPair.value) return t("table.target_select.title_pair")
    if (isCatTriple.value) return t("table.target_select.title_triple")
    if (isFavor.value) return t("table.target_select.title_favor")
    if (isTargetedAttack.value) return t("table.target_select.title_targeted_attack")
    return t("table.target_select.title_default")
  })

  const subtitle = computed(() => {
    if (isCatPair.value) return t("table.target_select.subtitle_pair")
    if (isCatTriple.value) return t("table.target_select.subtitle_triple")
    if (isFavor.value) return t("table.target_select.subtitle_favor")
    if (isTargetedAttack.value) return t("table.target_select.subtitle_targeted_attack")
    return t("table.target_select.subtitle_default")
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

  const cardOptions = computed(() => {
    const query = searchCardQuery.value.trim().toLowerCase()
    return CARD_CATALOG.filter((c) => c.id !== "exploding-kitten")
      .map((c) => ({ id: c.id, name: cardName(c.id), label: cardLabel(c.id), text: cardText(c.id) }))
      .filter((c) => !query || c.name.toLowerCase().includes(query) || c.label.toLowerCase().includes(query))
  })

  const canConfirm = computed(() => {
    if (!selectedTargetId.value) return false
    if (props.needsNamedCard && !selectedNamedCardId.value) return false
    return true
  })

  function confirm() {
    if (!canConfirm.value || !selectedTargetId.value) return
    emit("confirm", selectedTargetId.value, selectedNamedCardId.value ?? undefined)
  }
</script>

<style scoped lang="scss">
  .target-select {
    position: fixed;
    inset: 0;
    background: rgb(20 8 0 / 72%);
    backdrop-filter: blur(4px);
    display: grid;
    place-items: center;
    z-index: 25;
    padding: 1rem;
    animation: backdrop-fade 0.2s ease;

    &__panel {
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

    &__header {
      text-align: center;
    }

    &__title {
      font-size: 1.45rem;
      margin: 0 0 0.3rem;
      color: var(--accent);
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    }

    &__subtitle {
      margin: 0;
      font-size: 0.9rem;
      color: var(--text-dim);
    }

    &__section {
      // target section container
    }

    &__section-label {
      display: block;
      font-family: var(--font-display);
      font-size: 0.82rem;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: var(--text-dim);
      margin-bottom: 0.5rem;
    }

    &__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 0.65rem;
    }

    &__player-card {
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

      &:hover {
        background: rgb(90 38 20 / 70%);
        border-color: rgba(255, 194, 26, 0.5);
        transform: translateY(-2px);
      }

      &--selected {
        background: rgb(110 45 20 / 90%);
        border-color: var(--warn);
        box-shadow:
          0 0 16px rgba(255, 194, 26, 0.45),
          0 4px 10px rgba(0, 0, 0, 0.4);
      }
    }

    &__player-info {
      min-width: 0;
      flex: 1;
    }

    &__card-count {
      font-size: 0.76rem;
      color: var(--text-dim);
    }

    &__check-icon {
      position: absolute;
      top: 6px;
      right: 8px;
      font-weight: bold;
      color: var(--warn);
      font-size: 1rem;
    }

    &__empty {
      text-align: center;
      color: var(--text-dim);
      padding: 1rem;
      margin: 0;
    }

    &__demand {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      border-top: 1px dashed rgba(255, 255, 255, 0.15);
      padding-top: 0.85rem;
    }

    &__demand-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    &__search-input {
      padding: 0.3rem 0.6rem;
      font-size: 0.82rem;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(0, 0, 0, 0.35);
      color: var(--text);
      width: 170px;
    }

    &__card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
      gap: 0.5rem;
      max-height: 220px;
      overflow-y: auto;
      padding: 0.35rem 0.2rem;
    }

    &__card-choice {
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

      &:hover {
        background: rgba(80, 32, 18, 0.8);
        transform: translateY(-3px) scale(1.175);
        z-index: 10;
      }

      &--selected {
        border-color: var(--warn);
        background: rgba(120, 50, 20, 0.9);
        box-shadow: 0 0 14px rgba(255, 194, 26, 0.4);
        transform: translateY(-4px);

        &:hover {
          transform: translateY(-4px) scale(1.175);
          z-index: 10;
        }
      }
    }

    &__card-name {
      font-size: 0.72rem;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 80px;
      color: var(--text);
    }

    &__actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      margin-top: 0.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 0.85rem;
    }

    &__cancel-btn {
      padding: 0.5rem 1.1rem;
    }

    &__confirm-btn {
      padding: 0.5rem 1.4rem;
      font-weight: 700;
      box-shadow: 0 4px 14px rgba(255, 122, 26, 0.4);
    }
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
