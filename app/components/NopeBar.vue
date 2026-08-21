<template lang="pug">
.nope-bar(role="status")
  .nope-bar__fill(:style="{ transform: `scaleX(${fraction})` }")
  .nope-bar__content
    // 1. The Stack of Cards with z-index ordering and PlayerAvatar on Nope cards
    .nope-bar__stack(:aria-label="$t('table.nope_bar.stack_aria')")
      .nope-bar__stack-item(
        v-for="(action, i) in stack"
        :class="{ 'nope-bar__stack-item--nope': action.cardId === 'nope' || i > 0, 'nope-bar__stack-item--base': i === 0 }"
        :key="action.id + i"
        :style="{ zIndex: i + 1 }"
      )
        CardImage(:card-id="action.cardId" width="54px")
        // Mini avatar of the player who played this Nope card at the bottom-right corner
        .nope-bar__badge(
          v-if="action.cardId === 'nope' || i > 0"
          :title="$t('table.nope_bar.noped_by_title', { name: playerById(action.playerId)?.nickname ?? $t('table.nope_bar.unknown_player') })"
        )
          PlayerAvatar(
            :alive="playerById(action.playerId)?.alive"
            :avatar-id="playerById(action.playerId)?.avatarId"
            :size="22"
          )

    // 2. Action Information: Caster [Avatar] ➔ Target [Avatar]
    .nope-bar__info
      .nope-bar__players-flow
        // Caster
        .nope-bar__pill.nope-bar__pill--caster(:title="$t('table.nope_bar.caster_title', { name: caster?.nickname ?? '' })")
          PlayerAvatar(:alive="caster?.alive" :avatar-id="caster?.avatarId" :size="26")
          span.nope-bar__pill-name {{ caster?.nickname ?? $t('table.nope_bar.someone') }}

        // Target (if exists)
        template(v-if="target")
          span.nope-bar__target-arrow(aria-hidden="true")
            Icon(name="lucide:arrow-right")
          .nope-bar__pill.nope-bar__pill--target(:title="$t('table.nope_bar.target_title', { name: target.nickname })")
            PlayerAvatar(:alive="target.alive" :avatar-id="target.avatarId" :size="26")
            span.nope-bar__pill-name {{ target.nickname }}

      .nope-bar__details
        .nope-bar__title-row
          span.nope-bar__prefix {{ $t('table.nope_bar.used_prefix') }}
          strong.nope-bar__action-name {{ actionTitle }}

        .nope-bar__status-row
          span.nope-bar__verdict(
            v-if="nopesCount > 0"
            :class="{ 'nope-bar__verdict--blocked': isBlocked, 'nope-bar__verdict--active': !isBlocked }"
          )
            span.nope-bar__status-dot
            | {{ verdictText }}
          span.nope-bar__countdown.muted {{ $t('table.nope_bar.responding_countdown', { seconds: remaining }) }}

    // 3. Interaction Actions
    .nope-bar__actions
      button.nope-bar__btn.nope-bar__btn--nope.danger(v-if="hasNope && !youPlayedTop" @click="$emit('nope')") {{ $t('table.nope_bar.nope') }}
      button.nope-bar__btn.nope-bar__btn--pass(
        v-if="hasNope && !youPlayedTop"
        :disabled="passed"
        @click="$emit('pass')"
      ) {{ passed ? $t('table.nope_bar.passed') : $t('table.nope_bar.pass') }}
      span.nope-bar__waiting.muted.small(v-else) {{ $t('table.nope_bar.waiting') }}
</template>

<script setup lang="ts">
  import type { PendingAction, PublicPlayer } from "#shared/types/game"

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

  const { t } = useI18n()
  const { cardName } = useCardText()
  const { remaining, fraction } = useCountdown(() => props.deadline)

  const playerById = (id: string | null | undefined): PublicPlayer | undefined => props.players.find((p) => p.id === id)

  const baseAction = computed<PendingAction | undefined>(() => props.stack[0])
  const caster = computed(() => (baseAction.value ? playerById(baseAction.value.playerId) : undefined))
  const target = computed(() =>
    baseAction.value?.targetPlayerId ? playerById(baseAction.value.targetPlayerId) : undefined
  )

  const nopesCount = computed(() => Math.max(0, props.stack.length - 1))
  const isBlocked = computed(() => nopesCount.value % 2 === 1)

  const lastNoper = computed(() => {
    if (props.stack.length <= 1) return undefined
    const top = props.stack[props.stack.length - 1]
    return top ? playerById(top.playerId) : undefined
  })

  const actionTitle = computed(() => {
    const base = baseAction.value
    if (!base) return ""
    if (base.combo === "pair") return t("table.nope_bar.combo_pair")
    if (base.combo === "triple") {
      const demanded = base.namedCardId ? ` (${cardName(base.namedCardId)})` : ""
      return t("table.nope_bar.combo_triple", { demanded })
    }
    if (base.combo === "five-different") return t("table.nope_bar.combo_five")
    return cardName(base.cardId)
  })

  const verdictText = computed(() => {
    if (nopesCount.value === 0) return ""
    if (isBlocked.value) {
      const noperName = lastNoper.value?.nickname ?? "NOPE"
      return t("table.nope_bar.blocked_by", { name: noperName, count: nopesCount.value })
    }
    return t("table.nope_bar.in_effect", { count: nopesCount.value })
  })
</script>

<style scoped lang="scss">
  .nope-bar {
    position: relative;
    overflow: hidden;
    background: linear-gradient(180deg, #f8ecd2, var(--parchment) 45%, var(--parchment-2));
    border-radius: 16px;
    box-shadow:
      0 0 0 4px rgb(232 53 46 / 55%),
      0 18px 40px rgb(20 8 0 / 60%);
    color: var(--ink);

    /* Drains left to right as the window closes. */
    &__fill {
      position: absolute;
      inset: 0;
      transform-origin: left;
      background: linear-gradient(90deg, rgb(232 53 46 / 26%), rgb(245 119 28 / 10%));
      transition: transform 0.25s linear;
    }

    &__content {
      position: relative;
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1.1rem;
      flex-wrap: wrap;
    }

    /* 1. Stack cards styling */
    &__stack {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
    }

    &__stack-item {
      position: relative;
      transition: transform 0.15s ease;

      margin-bottom: 12px;

      &:hover {
        transform: scale(1.175) translateY(-8px);
        z-index: 50 !important;
      }
    }

    &__badge {
      position: absolute;
      bottom: -12px;
      right: -4px;
      z-index: 51;
      pointer-events: none;
      border-radius: 50%;
    }

    /* 2. Action info & Player flow */
    &__info {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      flex: 1;
      min-width: 220px;
      padding: 0 20px;
    }

    &__players-flow {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    &__pill {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 2px 8px 2px 2px;
      background: rgb(0 0 0 / 8%);
      border: 1px solid rgb(0 0 0 / 12%);
      border-radius: 999px;

      &--target {
        background: rgb(232 53 46 / 10%);
        border-color: rgb(232 53 46 / 25%);
      }
    }

    &__pill-name {
      font-family: var(--font-display);
      font-size: 0.92rem;
      font-weight: 700;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      color: var(--ink);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 120px;
    }

    &__target-arrow {
      color: var(--bad);
      font-weight: 800;
      font-size: 0.95rem;
      line-height: 1;
    }

    &__details {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    &__title-row {
      display: flex;
      align-items: baseline;
      gap: 0.35rem;
      font-size: 0.95rem;
    }

    &__prefix {
      color: var(--ink-dim);
      font-size: 0.88rem;
    }

    &__action-name {
      font-family: var(--font-display);
      font-size: 1.05rem;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      color: var(--ink);
    }

    &__status-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    &__verdict {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 1px 7px;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 700;
      font-family: var(--font-display);
      letter-spacing: 0.2px;
      text-transform: uppercase;

      &--blocked {
        background: rgb(232 53 46 / 15%);
        color: #b71c1c;
        border: 1px solid rgb(232 53 46 / 35%);

        .nope-bar__status-dot {
          animation: pulse-dot 1.2s ease-in-out infinite;
        }
      }

      &--active {
        background: rgb(76 201 95 / 20%);
        color: #1b5e20;
        border: 1px solid rgb(76 201 95 / 35%);
      }
    }

    &__status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }

    &__countdown {
      font-size: 0.84rem;
      color: var(--ink-dim);
      font-variant-numeric: tabular-nums;
    }

    /* 3. Actions button styling */
    &__actions {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    &__btn {
      &--nope {
        font-weight: 700;
        letter-spacing: 0.5px;
      }

      &--pass {
        white-space: nowrap;
      }
    }

    &__waiting {
      color: var(--ink-dim);
      font-size: 0.85rem;
    }
  }

  @keyframes pulse-dot {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.4;
      transform: scale(1.3);
    }
  }
</style>
