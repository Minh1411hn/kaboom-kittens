<template lang="pug">
aside.event-log
  .event-log__entries(ref="scroller")
    .event-log__entry(
      v-for="entry in entries"
      :class="['event-log__entry--' + entry.kind, entry.type && 'event-log__entry--' + entry.type]"
      :key="entry.key"
    )
      template(v-if="entry.kind === 'chat'")
        span.event-log__chat-sender {{ entry.nickname }}:
        span.event-log__chat-text {{ entry.text }}
      template(v-else)
        Icon.event-log__event-icon(
          v-if="entry.type && EVENT_ICON[entry.type]"
          :name="EVENT_ICON[entry.type]"
          aria-hidden="true"
        )
        span.event-log__event-text {{ entry.text }}
    p.event-log__empty(v-if="!entries.length") {{ $t("table.event_log.empty") }}

  form.event-log__say(@submit.prevent="say")
    input.event-log__input(
      v-model="draft"
      :placeholder="$t('table.event_log.placeholder')"
      autocomplete="off"
      maxlength="200"
    )
    button.event-log__btn(:disabled="!draft.trim()" type="submit") {{ $t("table.event_log.send") }}
</template>

<script setup lang="ts">
  import type { ChatMessage } from "#shared/protocol/messages"
  import type { GameEvent, PublicPlayer } from "#shared/types/game"

  const props = defineProps<{ events: GameEvent[]; chat: ChatMessage[]; players: PublicPlayer[] }>()
  const emit = defineEmits<{ say: [text: string] }>()

  const { eventText } = useEventText()

  const draft = ref("")
  const scroller = ref<HTMLElement | null>(null)

  /** Icons for the event types that already get their own colour treatment below. */
  const EVENT_ICON: Partial<Record<GameEvent["type"], string>> = {
    "kitten-drawn": "lucide:bomb",
    "player-exploded": "lucide:bomb",
    "player-quit": "lucide:log-out",
    "kitten-defused": "lucide:shield-check",
    "game-over": "lucide:trophy",
    "action-noped": "lucide:ban",
    "player-attacked": "lucide:swords",
    "turn-changed": "lucide:arrow-right-circle",
    "game-started": "lucide:play"
  }

  /** Game log and chat share one timeline so the story reads in order. */
  const entries = computed(() => {
    const combined = [
      ...props.events.map((event) => ({
        key: `e${event.seq}`,
        at: event.at,
        kind: "event" as const,
        text: eventText(event, props.players),
        type: event.type as GameEvent["type"] | undefined,
        nickname: ""
      })),
      ...props.chat.map((message) => ({
        key: `c${message.id}`,
        at: message.at,
        kind: "chat" as const,
        text: message.text,
        // Present on both shapes so the template can bind it without narrowing.
        type: undefined as GameEvent["type"] | undefined,
        nickname: message.nickname
      }))
    ]
    return combined.sort((a, b) => a.at - b.at).slice(-300)
  })

  watch(
    entries,
    async () => {
      await nextTick()
      const element = scroller.value
      if (element) element.scrollTop = element.scrollHeight
    },
    { flush: "post" }
  )

  function say() {
    const text = draft.value.trim()
    if (!text) return
    emit("say", text)
    draft.value = ""
  }
</script>

<style scoped lang="scss">
  .event-log {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    min-height: 0;
    width: 100%;
    padding: 0.75rem 0.85rem;
    background: $cream-card;
    color: $ink;
    border: $outline-width solid $ink;
    border-radius: 14px;
    box-shadow: $shadow-sm;
    font-family:
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      Roboto,
      Helvetica,
      Arial,
      sans-serif;

    &__entries {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      font-size: 0.875rem;
      line-height: 1.45;
      min-height: 140px;
      max-height: 40vh;
      padding: 0.25rem 0.15rem;
      scrollbar-width: thin;
      scrollbar-color: $ink transparent;

      &::-webkit-scrollbar {
        width: 5px;
      }

      &::-webkit-scrollbar-thumb {
        background-color: $ink;
        border-radius: 999px;
      }
    }

    &__entry {
      margin: 0;
      padding: 0.4rem 0.6rem;
      border-radius: 6px;
      word-break: break-word;
      font-size: 0.875rem;
      line-height: 1.45;
      letter-spacing: -0.01em;

      &--chat {
        background: $cream;
        border: 1px solid $ink;
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        align-items: baseline;
      }

      &--event {
        background: $cream;
        border-left: 3px solid $ink;
        color: $ink-dim;
        font-size: 0.825rem;
        line-height: 1.4;
        font-weight: 400;

        :deep(.iconify) {
          margin-right: 4px;
          vertical-align: middle;
        }
      }

      &--player-exploded,
      &--kitten-drawn {
        background: rgb(192 57 43 / 14%);
        border-left: 3px solid $bad;
        color: $ink;
        font-weight: 600;
      }

      &--kitten-defused,
      &--game-over {
        background: rgb(63 143 74 / 16%);
        border-left: 3px solid $good;
        color: $ink;
        font-weight: 600;
      }

      &--action-noped,
      &--player-attacked {
        background: rgb(224 149 28 / 20%);
        border-left: 3px solid $warn;
        color: $ink;
        font-weight: 600;
      }

      &--turn-changed {
        background: rgb(74 31 24 / 8%);
        border-left: 3px solid $ink-dim;
        color: $ink;
        font-weight: 500;
      }

      &--game-started {
        background: transparent;
        border-left: none;
        border-top: 1px dashed $ink;
        border-bottom: 1px dashed $ink;
        border-radius: 0;
        color: $ink;
        text-align: center;
        font-weight: 700;
        margin: 1.25rem 0 0.5rem;
        padding: 0.6rem 0;
      }
    }

    &__chat-sender {
      color: $accent-dim;
      font-weight: 700;
      letter-spacing: 0.01em;
    }

    &__chat-text {
      color: $ink;
      font-weight: 400;
    }

    &__event-icon {
      margin-right: 4px;
      vertical-align: middle;
    }

    &__empty {
      margin: auto 0;
      text-align: center;
      color: $ink-dim;
      font-size: 0.85rem;
      font-style: italic;
      padding: 1.5rem 0.5rem;
    }

    &__say {
      display: flex;
      gap: 0.45rem;
      align-items: center;
    }

    &__input {
      flex: 1;
      background: $cream;
      color: $ink;
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 400;
      border: 2px solid $ink;
      border-radius: 8px;
      padding: 0.5rem 0.75rem;
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;

      &::placeholder {
        color: $ink-dim;
        font-weight: 400;
      }

      &:focus {
        outline: none;
        box-shadow: 0 0 0 2px $accent;
      }
    }

    &__btn {
      font-family: var(--font-display);
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      padding: 0.5rem 0.95rem;
      background: linear-gradient(180deg, $gold-1, $gold-2);
      color: $ink;
      border: 2px solid $ink;
      border-radius: 8px;
      box-shadow: $shadow-sm;
      cursor: pointer;
      transition:
        transform 0.08s ease,
        filter 0.15s ease,
        opacity 0.15s ease;

      &:hover:not(:disabled) {
        filter: brightness(1.12);
        transform: translateY(-1px);
      }

      &:active:not(:disabled) {
        transform: translateY(1px);
        filter: brightness(0.95);
      }

      &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
        transform: none;
      }
    }
  }
</style>
