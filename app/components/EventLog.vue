<script setup lang="ts">
import type { ChatMessage } from "#shared/protocol/messages";
import type { GameEvent } from "#shared/types/game";

const props = defineProps<{ events: GameEvent[]; chat: ChatMessage[] }>();
const emit = defineEmits<{ say: [text: string] }>();

const draft = ref("");
const scroller = ref<HTMLElement | null>(null);

/** Icons for the event types that already get their own colour treatment below. */
const EVENT_ICON: Partial<Record<GameEvent["type"], string>> = {
    "kitten-drawn": "lucide:bomb",
    "player-exploded": "lucide:bomb",
    "kitten-defused": "lucide:shield-check",
    "game-over": "lucide:trophy",
    "action-noped": "lucide:ban",
    "player-attacked": "lucide:swords",
    "turn-changed": "lucide:arrow-right-circle",
    "game-started": "lucide:play",
};

/** Game log and chat share one timeline so the story reads in order. */
const entries = computed(() => {
    const combined = [
        ...props.events.map((event) => ({
            key: `e${event.seq}`,
            at: event.at,
            kind: "event" as const,
            text: event.message,
            type: event.type as GameEvent["type"] | undefined,
            nickname: "",
        })),
        ...props.chat.map((message) => ({
            key: `c${message.id}`,
            at: message.at,
            kind: "chat" as const,
            text: message.text,
            // Present on both shapes so the template can bind it without narrowing.
            type: undefined as GameEvent["type"] | undefined,
            nickname: message.nickname,
        })),
    ];
    return combined.sort((a, b) => a.at - b.at).slice(-300);
});

watch(
    entries,
    async () => {
        await nextTick();
        const element = scroller.value;
        if (element) element.scrollTop = element.scrollHeight;
    },
    { flush: "post" },
);

function say() {
    const text = draft.value.trim();
    if (!text) return;
    emit("say", text);
    draft.value = "";
}
</script>

<template>
    <aside class="log panel">
        <div ref="scroller" class="entries">
            <div
                v-for="entry in entries"
                :key="entry.key"
                class="entry"
                :class="[entry.kind, entry.type]"
            >
                <template v-if="entry.kind === 'chat'">
                    <span class="chat-sender">{{ entry.nickname }}:</span>
                    <span class="chat-text">{{ entry.text }}</span>
                </template>
                <template v-else>
                    <Icon
                        v-if="entry.type && EVENT_ICON[entry.type]"
                        :name="EVENT_ICON[entry.type]!"
                        aria-hidden="true"
                    />
                    <span class="event-text">{{ entry.text }}</span>
                </template>
            </div>
            <p v-if="!entries.length" class="empty-state">
                Bàn chơi đang yên ắng.
            </p>
        </div>

        <form class="say" @submit.prevent="say">
            <input
                v-model="draft"
                maxlength="200"
                placeholder="Nhập tin nhắn…"
                autocomplete="off"
            />
            <button type="submit" :disabled="!draft.trim()">Gửi</button>
        </form>
    </aside>
</template>

<style scoped lang="scss">
.log {
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
}

.entries {
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
}

.entries::-webkit-scrollbar {
    width: 5px;
}

.entries::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.25);
    border-radius: 999px;
}

.entry {
    margin: 0;
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    word-break: break-word;
    font-size: 0.875rem;
    line-height: 1.45;
    letter-spacing: -0.01em;
}

.entry.chat {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.09);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: baseline;
}

.entry.chat .chat-sender {
    color: #ffb049;
    font-weight: 700;
    letter-spacing: 0.01em;
}

.entry.chat .chat-text {
    color: #f8fafc;
    font-weight: 400;
}

.entry.event {
    background: rgba(255, 255, 255, 0.04);
    border-left: 3px solid rgba(255, 255, 255, 0.35);
    color: #cbd5e1;
    font-size: 0.825rem;
    line-height: 1.4;
    font-weight: 400;
}

.entry.event :deep(.iconify) {
    margin-right: 4px;
    vertical-align: middle;
}

.entry.player-exploded,
.entry.kitten-drawn {
    background: rgba(239, 68, 68, 0.18);
    border-left: 3px solid #ef4444;
    color: #fee2e2;
    font-weight: 600;
}

.entry.kitten-defused,
.entry.game-over {
    background: rgba(34, 197, 94, 0.18);
    border-left: 3px solid #22c55e;
    color: #dcfce7;
    font-weight: 600;
}

.entry.action-noped,
.entry.player-attacked {
    background: rgba(245, 158, 11, 0.18);
    border-left: 3px solid #f59e0b;
    color: #fef9c3;
    font-weight: 600;
}

.entry.turn-changed {
    background: rgba(59, 130, 246, 0.16);
    border-left: 3px solid #60a5fa;
    color: #f0f9ff;
    font-weight: 500;
}

.entry.event.game-started {
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

.empty-state {
    margin: auto 0;
    text-align: center;
    color: rgba(255, 255, 255, 0.45);
    font-size: 0.85rem;
    font-style: italic;
    padding: 1.5rem 0.5rem;
}

.say {
    display: flex;
    gap: 0.45rem;
    align-items: center;
}

.say input {
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
}

.say input::placeholder {
    color: rgba(255, 255, 255, 0.4);
    font-weight: 400;
}

.say input:focus {
    outline: none;
    border-color: #ff7a1a;
    box-shadow:
        0 0 0 2px rgba(255, 122, 26, 0.3),
        inset 0 1px 2px rgba(0, 0, 0, 0.3);
}

.say button {
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
}

.say button:hover:not(:disabled) {
    filter: brightness(1.12);
    transform: translateY(-1px);
}

.say button:active:not(:disabled) {
    transform: translateY(1px);
    filter: brightness(0.95);
}

.say button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
}
</style>
