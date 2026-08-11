<script setup lang="ts">
import type { ChatMessage } from '#shared/protocol/messages'
import type { GameEvent } from '#shared/types/game'

const props = defineProps<{ events: GameEvent[]; chat: ChatMessage[] }>()
const emit = defineEmits<{ say: [text: string] }>()

const draft = ref('')
const scroller = ref<HTMLElement | null>(null)

/** Game log and chat share one timeline so the story reads in order. */
const entries = computed(() => {
  const combined = [
    ...props.events.map((event) => ({
      key: `e${event.seq}`,
      at: event.at,
      kind: 'event' as const,
      text: event.message,
      type: event.type as GameEvent['type'] | undefined,
      nickname: '',
    })),
    ...props.chat.map((message) => ({
      key: `c${message.id}`,
      at: message.at,
      kind: 'chat' as const,
      text: message.text,
      // Present on both shapes so the template can bind it without narrowing.
      type: undefined as GameEvent['type'] | undefined,
      nickname: message.nickname,
    })),
  ]
  return combined.sort((a, b) => a.at - b.at).slice(-80)
})

watch(
  () => entries.value.length,
  async () => {
    await nextTick()
    const element = scroller.value
    if (element) element.scrollTop = element.scrollHeight
  },
)

function say() {
  const text = draft.value.trim()
  if (!text) return
  emit('say', text)
  draft.value = ''
}
</script>

<template>
  <aside class="log panel">
    <div ref="scroller" class="entries">
      <p v-for="entry in entries" :key="entry.key" class="entry" :class="[entry.kind, entry.type]">
        <template v-if="entry.kind === 'chat'">
          <strong>{{ entry.nickname }}:</strong> {{ entry.text }}
        </template>
        <template v-else>{{ entry.text }}</template>
      </p>
      <p v-if="!entries.length" class="muted">The table is quiet.</p>
    </div>

    <form class="say" @submit.prevent="say">
      <input v-model="draft" maxlength="200" placeholder="Say something…" />
      <button :disabled="!draft.trim()">Send</button>
    </form>
  </aside>
</template>

<style scoped>
.log {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-height: 0;
  width: 100%;
  padding: 0.8rem 0.9rem;
}

.entries {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  min-height: 120px;
  max-height: 38vh;
  scrollbar-width: thin;
}

/* Colours are ink-on-parchment here, not text-on-wood. */
.entry {
  margin: 0;
  color: var(--ink-dim);
  line-height: 1.35;
}

.entry.chat {
  color: var(--ink);
}

.entry.player-exploded,
.entry.kitten-drawn {
  color: #a5201a;
  font-weight: bold;
}

.entry.action-noped {
  color: #8a5a06;
  font-weight: bold;
}

.entry.game-over,
.entry.kitten-defused {
  color: #2a6b1e;
  font-weight: bold;
}

.entry.turn-changed {
  color: var(--ink);
}

.say {
  display: flex;
  gap: 0.5rem;
}

.say input {
  flex: 1;
}
</style>
