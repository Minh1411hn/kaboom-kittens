<script setup lang="ts">
import type { Card } from "#shared/types/game";
import { CARD_CATALOG } from "#shared/types/game";
import { useSortable } from "@vueuse/integrations/useSortable";

const props = withDefaults(
    defineProps<{
        cards: Card[];
        /**
         * Alter the Future: cards become drag-reorderable and must be confirmed
         * rather than just acknowledged. Only `alter-the-future-3x`/`5x` use the
         * `reorder-cards` interaction kind today (see server/game/cards/alter-the-future.ts) —
         * if a future card ever reuses that kind, double check this dialog's
         * hardcoded Vietnamese copy still fits before wiring it up the same way.
         */
        editable?: boolean;
    }>(),
    { editable: false },
);

const emit = defineEmits<{
    close: [];
    submit: [uids: string[]];
}>();

function cardName(id: string): string {
    return CARD_CATALOG.find((c) => c.id === id)?.name ?? id;
}

// --- editable / drag-to-reorder ---------------------------------------------
//
// A hand-rolled first pass here (inline `position: fixed` on a TransitionGroup
// child, driven by our own pointer-move geometry) fought with Vue's own FLIP
// bookkeeping and never dragged freely. useSortable (VueUse's wrapper around
// SortableJS) owns the whole gesture instead — free movement, live insertion
// gap, touch support — and keeps `order` in sync with the DOM via its default
// `onUpdate` (do not pass a custom `onUpdate` in the options below, or that
// sync is lost). `order` is the single source of truth for the rendered list
// in both modes; in read-only mode `disabled: true` means it never diverges
// from `props.cards`.

const order = ref<Card[]>([...props.cards]);
const choicesEl = ref<HTMLElement | null>(null);

useSortable(choicesEl, order, {
    disabled: !props.editable,
    animation: 150,
    // Force SortableJS's own Pointer/Touch-driven fallback on every device,
    // rather than native HTML5 draggable — same reasoning as
    // app/composables/useDrawDrag.ts: native DnD doesn't fire on touch and
    // can't be styled reliably.
    forceFallback: true,
    ghostClass: "reorder-ghost",
    chosenClass: "reorder-chosen",
    dragClass: "reorder-dragging",
});
</script>

<template>
    <div class="backdrop" @click.self="!editable && emit('close')">
        <section class="dialog panel" role="dialog" aria-modal="true">
            <header class="dialog-header">
                <h2>
                    {{
                        editable
                            ? "Sắp xếp lại tương lai (Alter the Future)"
                            : "Nhìn thấu tương lai (See the Future)"
                    }}
                </h2>
                <p class="subtitle">
                    {{
                        editable
                            ? "Kéo để sắp xếp lại thứ tự các lá bài trên đầu chồng bài rút:"
                            : "Thứ tự các lá bài trên đầu chồng bài rút:"
                    }}
                </p>
            </header>

            <div ref="choicesEl" class="choices" :class="{ editable }">
                <div
                    v-for="(card, index) in order"
                    :key="card.uid || index"
                    class="choice-item"
                >
                    <span class="card-rank">
                        {{
                            index === 0 ? "Top #1 (Trên cùng)" : `#${index + 1}`
                        }}
                    </span>
                    <div class="card-wrapper">
                        <CardImage
                            :card-id="card.id"
                            :uid="card.uid"
                            width="100%"
                        />
                    </div>
                    <span class="card-label">{{ cardName(card.id) }}</span>
                </div>
            </div>
            <p v-if="!cards.length" class="muted">Không có lá bài nào.</p>

            <footer class="dialog-footer">
                <button
                    v-if="!editable"
                    type="button"
                    class="primary"
                    @click="emit('close')"
                >
                    Đã rõ
                </button>
                <button
                    v-else
                    type="button"
                    class="primary"
                    @click="
                        emit(
                            'submit',
                            order.map((c) => c.uid),
                        )
                    "
                >
                    Xác nhận thứ tự
                </button>
            </footer>
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
    animation: backdrop-fade 0.2s ease;
}

.dialog {
    position: relative;
    width: 80vw;
    max-height: 86vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    padding: 1.5rem 1.8rem;
    text-align: center;
}

.dialog-header {
    position: relative;
}

.dialog-header h2 {
    font-size: 1.4rem;
    line-height: 1.2;
    margin: 0;
}

.subtitle {
    margin: 0.35rem 0 0;
    font-size: 0.95rem;
    color: var(--text-dim);
}

/* Số cột luôn khớp số lá bài đang hiển thị (3 hoặc 5) — CSS Grid không tự
   xuống hàng như flex-wrap, nên các cột luôn nằm trên đúng 1 hàng theo cấu
   trúc, không cần tính toán bằng tay. Mỗi cột rộng tối đa 156px (giữ cỡ lá
   bài hiện tại khi đủ chỗ) và chỉ co lại — không bao giờ wrap — khi dialog
   không đủ rộng cho tất cả các cột ở mức tối đa. */
.choices {
    display: grid;
    grid-template-columns: repeat(
        v-bind("order.length || 1"),
        minmax(0, 156px)
    );
    justify-content: center;
    align-items: start;
    gap: 1rem;
    padding: 0.5rem 0;
}

.choice-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    min-width: 0; /* để cột grid được phép co nhỏ hơn nội dung tự nhiên */
}

.choices.editable .choice-item {
    cursor: grab;
    touch-action: none;
}

/* The empty slot SortableJS leaves at the spot the card would land — this
   IS the "insert between any two cards" feedback as it slides through the
   list live while dragging. */
.reorder-ghost {
    opacity: 0.35;
}

/* The original element while it's picked up (before the fallback clone
   takes over the visible dragging). */
.reorder-chosen {
    cursor: grabbing;
}

/* The floating clone that actually follows the pointer. */
.reorder-dragging {
    cursor: grabbing;
    rotate: -4deg;
    filter: drop-shadow(0 18px 30px rgb(20 8 0 / 55%));
}

.card-wrapper {
    width: 100%;
    border-radius: var(--card-radius);
    transition: transform 0.15s ease;
    position: relative;
}

.card-wrapper:hover {
    transform: translateY(-4px) scale(1.5);
    z-index: 10;
}

/* Avoids a distracting zoom flicker on siblings while one card is actively
   being dragged over them. */
.choices.editable .card-wrapper:hover {
    transform: none;
    z-index: auto;
}

.card-rank {
    font-family: var(--font-display);
    font-size: 0.8rem;
    color: var(--accent, #f5771c);
    letter-spacing: 0.5px;
    font-weight: bold;
}

.card-label {
    width: 100%;
    font-size: 0.85rem;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.dialog-footer {
    display: flex;
    justify-content: center;
    margin-top: 0.2rem;
}

@keyframes backdrop-fade {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}
</style>
