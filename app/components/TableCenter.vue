<script setup lang="ts">
import type { Card } from "#shared/types/game";

const props = defineProps<{
    drawCount: number;
    discardTop: Card | null;
    discardCount: number;
    direction: 1 | -1;
    canDraw: boolean;
    deadline: number | null;
    peek?: Card[] | null;
    /** The ghost is out, so the top of the stack should read as lifted off. */
    dragging?: boolean;
}>();

defineEmits<{
    /** The keyboard path — a mouse click deliberately does not draw. */
    draw: [];
    /** Hands the gesture to `useDrawDrag` in the page. */
    drawPointerDown: [PointerEvent];
}>();

const { remaining } = useCountdown(() => props.deadline);

const back = cardBackUrl();

/** Where a card flying out of a hand should land — see `CardDepartureFlyer`. */
const discardEl = useTemplateRef<HTMLElement>("discardEl");
defineExpose({
    discardRect: (): DOMRect | null =>
        discardEl.value?.getBoundingClientRect() ?? null,
});
</script>

<template>
    <div class="center">
        <div class="pile">
            <button
                class="deck"
                :class="{ dragging }"
                :disabled="!canDraw"
                :title="
                    canDraw
                        ? 'Kéo lá bài trên cùng về tay của bạn để rút bài'
                        : ''
                "
                :aria-label="`Chồng bài rút, còn ${drawCount} lá. Kéo lá bài trên cùng về tay bạn, hoặc nhấn phím Cách / Enter để rút bài.`"
                @pointerdown="$emit('drawPointerDown', $event)"
                @keydown.enter.prevent="$emit('draw')"
                @keydown.space.prevent="$emit('draw')"
            >
                <span class="pile-face">
                    <img :src="back" alt="" draggable="false" />
                </span>
            </button>
            <span class="ribbon">Còn {{ drawCount }} lá</span>
        </div>

        <div class="pile">
            <div ref="discardEl" class="discard">
                <CardImage
                    v-if="discardTop"
                    :card-id="discardTop.id"
                    :uid="discardTop.uid"
                    width="140px"
                />
                <div v-else class="empty">Trống</div>
            </div>
            <span class="ribbon quiet">Bài đã đánh · {{ discardCount }}</span>
        </div>
    </div>
</template>

<style scoped>
.center {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2rem;
}

.signpost {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 0.6rem 0.9rem;
    border-radius: 16px;
    background: linear-gradient(
        180deg,
        rgb(255 255 255 / 10%),
        rgb(0 0 0 / 14%)
    );
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 20%),
        var(--shadow-sm);
}

.direction {
    font-size: 2.2rem;
    line-height: 1;
    color: var(--text);
    text-shadow: 0 2px 4px rgb(20 8 0 / 60%);
}

.timer {
    font-family: var(--font-display);
    font-variant-numeric: tabular-nums;
    letter-spacing: 1px;
    color: var(--text-dim);
    font-size: 0.95rem;
}

.timer.urgent {
    color: #ffd0cb;
    text-shadow: 0 0 10px rgb(232 53 46 / 90%);
}

.pile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
}

/*
 * The draw pile is a squat tile rather than a card so it reads as a stack.
 * Two offset layers behind it stand in for the rest of the deck.
 */
.deck {
    position: relative;
    padding: 0;
    border: none;
    border-radius: 22px;
    background: none;
    box-shadow: none;
    /* Without this the browser claims the gesture and scrolls the page instead. */
    touch-action: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
}

.deck::before,
.deck::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    border-radius: 22px;
    background: linear-gradient(180deg, #b9291f, #7d1210);
    box-shadow: var(--shadow-sm);
}

.deck::before {
    transform: translate(7px, 7px);
}

.deck::after {
    transform: translate(3.5px, 3.5px);
}

.pile-face {
    position: relative;
    z-index: 1;
    display: block;
    width: 168px;
    aspect-ratio: var(--card-ratio);
    border-radius: 22px;
    overflow: hidden;
    box-shadow:
        inset 0 0 0 3px rgb(255 255 255 / 30%),
        0 8px 20px rgb(25 8 0 / 55%);
    transition:
        transform 0.12s ease,
        box-shadow 0.15s ease;
}

.pile-face img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.deck:not(:disabled) {
    cursor: grab;
}

/* The top card is in your hand, not on the stack — leave the two offset layers
   behind it standing so the pile still reads as a pile. */
.deck.dragging {
    cursor: grabbing;
}

.deck.dragging .pile-face {
    opacity: 0.3;
    box-shadow: none;
}

.deck:not(:disabled) .pile-face {
    box-shadow:
        inset 0 0 0 3px rgb(255 255 255 / 45%),
        0 0 0 4px rgb(255 194 26 / 65%),
        0 0 34px rgb(255 140 40 / 65%);
}

.deck:not(:disabled):hover .pile-face {
    transform: translateY(-5px);
}

.deck:disabled {
    opacity: 1;
}

.deck:active:not(:disabled) {
    transform: none;
}

/* A wooden nameplate under each pile. */
.ribbon {
    font-family: var(--font-display);
    text-transform: uppercase;
    letter-spacing: 1.2px;
    font-size: 0.95rem;
    color: var(--text);
    background: linear-gradient(180deg, #6b4118, #45260a);
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 20%),
        var(--shadow-sm);
    border-radius: 999px;
    padding: 0.28rem 0.9rem;
    white-space: nowrap;
}

.ribbon.quiet {
    font-size: 0.8rem;
    color: var(--text-dim);
    background: linear-gradient(
        180deg,
        rgb(255 255 255 / 10%),
        rgb(0 0 0 / 18%)
    );
}

.discard {
    display: grid;
    place-items: center;
    transition: transform 0.15s ease;
}

.discard:hover {
    transform: scale(1.175);
    z-index: 10;
    position: relative;
}

.empty {
    width: 140px;
    aspect-ratio: var(--card-ratio);
    border: 3px dashed rgb(255 255 255 / 25%);
    border-radius: var(--card-radius);
    display: grid;
    place-items: center;
    color: var(--text-dim);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 1px;
}
</style>
