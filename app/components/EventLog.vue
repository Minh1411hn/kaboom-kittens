<template lang="pug">
aside.event-log.panel
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
    p.event-log__empty(v-if="!entries.length") {{ $t('table.event_log.empty') }}

  form.event-log__say(@submit.prevent="say")
    input.event-log__input(v-model="draft" autocomplete="off" maxlength="200" :placeholder="$t('table.event_log.placeholder')")
    button.event-log__btn(:disabled="!draft.trim()" type="submit") {{ $t('table.event_log.send') }}
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
    background: rgba(26, 6, 6, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 14px;
    box-shadow:
      0 16px 36px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
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
      scrollbar-color: rgba(255, 255, 255, 0.25) transparent;

      &::-webkit-scrollbar {
        width: 5px;
      }

      &::-webkit-scrollbar-thumb {
        background-color: rgba(255, 255, 255, 0.25);
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
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.09);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        align-items: baseline;
      }

      &--event {
        background: rgba(255, 255, 255, 0.04);
        border-left: 3px solid rgba(255, 255, 255, 0.35);
        color: #cbd5e1;
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
        background: rgba(239, 68, 68, 0.18);
        border-left: 3px solid #ef4444;
        color: #fee2e2;
        font-weight: 600;
      }

      &--kitten-defused,
      &--game-over {
        background: rgba(34, 197, 94, 0.18);
        border-left: 3px solid #22c55e;
        color: #dcfce7;
        font-weight: 600;
      }

      &--action-noped,
      &--player-attacked {
        background: rgba(245, 158, 11, 0.18);
        border-left: 3px solid #f59e0b;
        color: #fef9c3;
        font-weight: 600;
      }

      &--turn-changed {
        background: rgba(59, 130, 246, 0.16);
        border-left: 3px solid #60a5fa;
        color: #f0f9ff;
        font-weight: 500;
      }

      &--game-started {
        background: transparent;
        border-left: none;
        border-top: 1px dashed rgba(255, 255, 255, 0.25);
        border-bottom: 1px dashed rgba(255, 255, 255, 0.25);
        border-radius: 0;
        color: #ffb049;
        text-align: center;
        font-weight: 700;
        margin: 1.25rem 0 0.5rem;
        padding: 0.6rem 0;
      }
    }

    &__chat-sender {
      color: #ffb049;
      font-weight: 700;
      letter-spacing: 0.01em;
    }

    &__chat-text {
      color: #f8fafc;
      font-weight: 400;
    }

    &__event-icon {
      margin-right: 4px;
      vertical-align: middle;
    }

    &__empty {
      margin: auto 0;
      text-align: center;
      color: rgba(255, 255, 255, 0.45);
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
      background: rgba(0, 0, 0, 0.45);
      color: #ffffff;
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 400;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 0.5rem 0.75rem;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;

      &::placeholder {
        color: rgba(255, 255, 255, 0.4);
        font-weight: 400;
      }

      &:focus {
        outline: none;
        border-color: #ff7a1a;
        box-shadow:
          0 0 0 2px rgba(255, 122, 26, 0.3),
          inset 0 1px 2px rgba(0, 0, 0, 0.3);
      }
    }

    &__btn {
      font-family: var(--font-display);
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      padding: 0.5rem 0.95rem;
      background: linear-gradient(180deg, #ff7a1a 0%, #d9530f 100%);
      color: #ffffff;
      border: none;
      border-radius: 8px;
      box-shadow:
        0 2px 5px rgba(0, 0, 0, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.25);
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
