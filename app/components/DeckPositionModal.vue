<script setup lang="ts">
import type { PublicGameState } from "#shared/types/game";

/**
 * Where to put the Exploding Kitten back after Defuse. Carved out of
 * InteractionModal.vue the same way `reorder-cards` was carved out into
 * SeeFutureModal.vue — this only ever mounts for the player who must answer
 * (see `showDeckPositionModal` in app/pages/room/[id].vue), so there's no
 * bystander/waiting branch here.
 */
const props = defineProps<{
    interaction: NonNullable<PublicGameState["interaction"]>;
}>();

const emit = defineEmits<{ submit: [index: number] }>();

// `null` means nothing picked yet — unlike the old slider (which defaulted
// to "top" and let you confirm immediately), this makes an explicit choice
// mandatory so a stray Confirm click can't silently bury the kitten on top.
const position = ref<number | null>(null);
// Tracks whether the current pick came from the RANDOM button, purely so it
// can stay highlighted as the active choice — cleared the moment any other
// button is picked instead.
const pickedByRandom = ref(false);

watch(
    () => props.interaction.id,
    () => {
        position.value = null;
        pickedByRandom.value = false;
    },
    { immediate: true },
);

function pick(index: number) {
    position.value = index;
    pickedByRandom.value = false;
}

const maxPosition = computed(() => props.interaction.maxPosition ?? 0);

// Button "N" ↔ index N-1 (so "1" is the very top). Only offered while its
// index is strictly below maxPosition — the index equal to maxPosition is
// always the bottom, already covered by the "Đặt ở cuối" button, so hiding
// it here avoids two buttons landing on the same slot once the draw pile
// gets small.
const numberedPositions = computed(() =>
    [0, 1, 2, 3, 4].filter((i) => i < maxPosition.value),
);

function pickRandom() {
    position.value = Math.floor(Math.random() * (maxPosition.value + 1));
    pickedByRandom.value = true;
}

const positionLabel = computed(() => {
    if (position.value === null) return "";
    if (position.value === 0) return "Trên cùng — người chơi kế tiếp sẽ rút lá này";
    if (position.value >= maxPosition.value) return "Dưới cùng";
    return `${position.value} lá tính từ trên cùng`;
});

const canSubmit = computed(() => position.value !== null);

function submit() {
    if (position.value === null) return;
    emit("submit", position.value);
}
</script>

<template>
    <div class="backdrop">
        <section class="dialog panel" role="dialog" aria-modal="true">
            <h2>{{ interaction.prompt }}</h2>

            <div class="choices">
                <button
                    v-for="i in numberedPositions"
                    :key="i"
                    type="button"
                    class="slot"
                    :class="{ selected: !pickedByRandom && position === i }"
                    @click="pick(i)"
                >
                    {{ i + 1 }}
                </button>
                <button
                    type="button"
                    class="slot wide"
                    :class="{ selected: !pickedByRandom && position === maxPosition }"
                    @click="pick(maxPosition)"
                >
                    Đặt ở cuối
                </button>
                <button
                    type="button"
                    class="slot wide random"
                    :class="{ selected: pickedByRandom }"
                    @click="pickRandom"
                >
                    🎲 RANDOM
                </button>
            </div>

            <p class="preview">
                <template v-if="position !== null">
                    Đặt <strong>{{ positionLabel }}</strong>
                </template>
                <template v-else>Chọn một vị trí bên trên.</template>
            </p>
            <p class="muted small">Không ai khác biết bạn đặt lá này ở đâu.</p>

            <button class="primary" :disabled="!canSubmit" @click="submit">
                Xác nhận
            </button>
        </section>
    </div>
</template>

<style scoped>
.backdrop {
    position: fixed;
    inset: 0;
    background: rgb(20 8 0 / 68%);
    backdrop-filter: blur(3px);
    display: grid;
    place-items: center;
    z-index: 20;
    padding: 1rem;
}

.dialog {
    max-width: min(480px, 100%);
    max-height: 86vh;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1.3rem 1.5rem;
    text-align: center;
}

.dialog h2 {
    font-size: 1.4rem;
    line-height: 1.15;
}

.choices {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
}

.slot {
    min-width: 3rem;
}

.slot.wide {
    min-width: auto;
}

.slot.selected {
    background: linear-gradient(180deg, #ffa02b, var(--accent) 45%, var(--accent-dim));
    color: #33180a;
    text-shadow: 0 1px 0 rgb(255 255 255 / 35%);
}

.preview {
    min-height: 1.4em;
}

.small {
    font-size: 0.85rem;
}
</style>
