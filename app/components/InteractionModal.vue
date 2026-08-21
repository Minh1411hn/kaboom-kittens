<template lang="pug">
.interaction-modal
  section.interaction-modal__panel.panel(aria-modal="true" role="dialog")
    h2.interaction-modal__title {{ title }}

    // Shared countdown so everyone sees the same clock
    .interaction-modal__clock(
      v-if="remaining !== null"
      :class="{ 'interaction-modal__clock--urgent': remaining <= 2 }"
    )
      span.interaction-modal__clock-track
        span.interaction-modal__clock-fill(:style="{ transform: `scaleX(${fraction})` }")
      span.interaction-modal__clock-text {{ remaining }}s

    .interaction-modal__body
      // Left: who must answer, ticked as they submit
      aside.interaction-modal__roster
        .interaction-modal__roster-row(
          v-for="p in roster"
          :class="{ 'interaction-modal__roster-row--done': p.done }"
          :key="p.id"
        )
          PlayerAvatar(:avatar-id="p.avatarId" :name="null" :size="34")
          span.interaction-modal__roster-name {{ p.nickname }}
          Icon.interaction-modal__tick(v-if="p.done" aria-hidden="true" name="lucide:circle-check")
          span.interaction-modal__spinner.interaction-modal__spinner--mini(v-else aria-hidden="true")

      // Right: pick a card (yours), or wait for the others
      .interaction-modal__main
        template(v-if="interaction.isForYou")
          .interaction-modal__choices
            button.interaction-modal__choice(
              v-for="card in choices"
              :disabled="!instantSelect && hasSubmitted"
              :key="card.uid"
              type="button"
              @click="onCardClick(card.uid)"
            )
              CardImage(
                :card-id="card.id"
                :disabled="!instantSelect && hasSubmitted && chosenUid !== card.uid"
                :selected="chosenUid === card.uid"
                :uid="card.uid"
                width="112px"
              )
            p.muted(v-if="!choices.length") {{ $t('table.interaction.no_cards') }}

          // Instant-select (Garbage Collection): tap = confirm, no button
          template(v-if="instantSelect")
            p.interaction-modal__note.muted(v-if="chosenUid") {{ $t('table.interaction.tap_to_change') }}
            p.interaction-modal__note.muted(v-else) {{ $t('table.interaction.tap_one') }}
          // Everyone else: pick then confirm
          template(v-else)
            button.interaction-modal__submit.primary(
              v-if="!hasSubmitted"
              :disabled="!canSubmit"
              type="button"
              @click="submit"
            ) {{ $t('table.interaction.confirm') }}
            p.interaction-modal__note.muted(v-else) {{ $t('table.interaction.chosen_waiting') }}

        template(v-else)
          p.interaction-modal__waiting.muted {{ $t('table.interaction.waiting_on', { names: waitingOn.join(', ') || '…' }) }}
          .interaction-modal__spinner
</template>

<script setup lang="ts">
  import type { Card, InteractionResponse, PublicGameState } from "#shared/types/game"

  /**
   * One component for every prompt in the game. It renders from the declarative
   * InteractionSpec the server sends, so adding a card that needs a new prompt
   * only means adding a branch here — never touching the table or the engine.
   */
  const props = defineProps<{
    interaction: NonNullable<PublicGameState["interaction"]>
    hand: Card[]
    players: PublicGameState["players"]
    youId: string | null
  }>()

  const emit = defineEmits<{ submit: [response: InteractionResponse] }>()

  const { t } = useI18n()

  const title = computed(() => {
    if (props.interaction.kind === "choose-card-from-hand") {
      const forPlayer = props.players.find((p) => p.id === props.interaction.forPlayerId)
      return t("interactions.choose-card-from-hand", { name: forPlayer?.nickname ?? "…" })
    }
    return t(`interactions.${props.interaction.kind}`)
  })

  const chosenUid = ref<string | null>(null)
  /** True once *this* client has locked in a choice (optimistic, before the
   *  next snapshot echoes it back in `interaction.answered`). */
  const submitted = ref(false)

  /** Which cards this prompt is asking about — own hand, or a supplied list. */
  const choices = computed<Card[]>(() => {
    if (props.interaction.kind === "simultaneous-choose-card") return props.hand
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
    { immediate: true }
  )

  /** Locked in once we've submitted locally or the server has recorded us. */
  const hasSubmitted = computed(
    () => submitted.value || (props.youId != null && props.interaction.answered.includes(props.youId))
  )

  /**
   * Garbage Collection: tapping a card IS the confirmation (no "Xác nhận"
   * button), and you may switch to another card right up to the deadline.
   * Every other prompt keeps the pick-then-confirm flow.
   */
  const instantSelect = computed(() => props.interaction.kind === "simultaneous-choose-card")

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
        nickname: player?.nickname ?? "—",
        avatarId: player?.avatarId ?? null,
        done
      }
    })
  )

  const waitingOn = computed(() => roster.value.filter((p) => !p.done).map((p) => p.nickname))

  const { remaining, fraction } = useCountdown(
    () => props.interaction.deadline,
    () => windowMs.value
  )

  function onCardClick(uid: string) {
    if (instantSelect.value) {
      if (uid === chosenUid.value) return // can't deselect — only switch to another card
      chosenUid.value = uid
      emit("submit", { type: "card", uid })
    } else if (!hasSubmitted.value) {
      chosenUid.value = uid
    }
  }

  function submit() {
    if (chosenUid.value && !hasSubmitted.value) {
      emit("submit", { type: "card", uid: chosenUid.value })
      submitted.value = true
    }
  }

  const canSubmit = computed(() => Boolean(chosenUid.value))
</script>

<style scoped lang="scss">
  .interaction-modal {
    position: fixed;
    inset: 0;
    background: rgb(20 8 0 / 68%);
    backdrop-filter: blur(3px);
    display: grid;
    place-items: center;
    z-index: 20;
    padding: 1rem;

    &__panel {
      max-width: min(720px, 100%);
      max-height: 86vh;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1.3rem 1.5rem;
    }

    &__title {
      text-align: center;
      font-size: 1.4rem;
      line-height: 1.15;
    }

    &__clock {
      display: flex;
      align-items: center;
      gap: 0.55rem;

      &--urgent {
        .interaction-modal__clock-text {
          color: #a5201a;
        }

        .interaction-modal__clock-fill {
          background: linear-gradient(90deg, #a5201a, var(--bad));
        }
      }
    }

    &__clock-track {
      flex: 1;
      height: 6px;
      border-radius: 999px;
      overflow: hidden;
      background: rgb(120 95 55 / 30%);
    }

    &__clock-fill {
      display: block;
      height: 100%;
      transform-origin: left;
      background: linear-gradient(90deg, #6b9b2f, #b5d24a);
      transition: transform 0.25s linear;
    }

    &__clock-text {
      font-family: var(--font-display);
      font-size: 0.85rem;
      letter-spacing: 1px;
      color: var(--ink-dim);
      font-variant-numeric: tabular-nums;
      min-width: 2.2ch;
      text-align: right;
    }

    &__body {
      display: flex;
      gap: 1.1rem;
      align-items: stretch;

      @media (max-width: 560px) {
        flex-direction: column;
      }
    }

    &__roster {
      flex: 0 0 auto;
      min-width: 150px;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      padding-right: 1.1rem;
      border-right: 1px solid rgb(120 95 55 / 25%);

      @media (max-width: 560px) {
        flex-direction: row;
        flex-wrap: wrap;
        min-width: 0;
        padding-right: 0;
        padding-bottom: 0.8rem;
        border-right: none;
        border-bottom: 1px solid rgb(120 95 55 / 25%);
      }
    }

    &__roster-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      opacity: 0.7;
      transition: opacity 0.2s ease;

      &--done {
        opacity: 1;
      }

      @media (max-width: 560px) {
        flex: 0 0 auto;
      }
    }

    &__roster-name {
      flex: 1;
      font-size: 0.9rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      @media (max-width: 560px) {
        max-width: 90px;
      }
    }

    &__tick {
      color: var(--good);
      font-size: 1.15rem;
      flex: 0 0 auto;
    }

    &__spinner {
      width: 28px;
      height: 28px;
      border: 4px solid rgb(120 95 55 / 30%);
      border-top-color: var(--bad);
      border-radius: 50%;
      animation: spin 0.9s linear infinite;

      &--mini {
        width: 15px;
        height: 15px;
        flex: 0 0 auto;
        border: 2px solid rgb(120 95 55 / 30%);
        border-top-color: var(--ink-dim);
        border-radius: 50%;
      }
    }

    &__main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    &__choices {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      justify-content: center;
    }

    &__choice {
      padding: 0;
      border: none;
      background: none;
      box-shadow: none;
      border-radius: var(--card-radius);
      position: relative;

      &:disabled {
        cursor: default;
      }

      &:hover:not(:disabled) {
        filter: none;

        :deep(.card) {
          transform: translateY(-6px) scale(1.175);
          z-index: 10;
        }
      }

      &:active:not(:disabled) {
        transform: none;
      }
    }

    &__note {
      font-weight: 600;
    }

    &__submit {
      // submit button styling
    }

    &__waiting {
      // waiting label
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
