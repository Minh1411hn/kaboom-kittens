<script setup lang="ts">
/**
 * A small, generic confirm/cancel prompt. Follows the same backdrop+panel
 * pattern as InteractionModal.vue, one z-index above it so it always wins
 * any stacking (e.g. confirming a quit while an interaction happens to be
 * open).
 */
withDefaults(
    defineProps<{
        title: string;
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
    }>(),
    {
        confirmLabel: "Xác nhận",
        cancelLabel: "Hủy",
    },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
    <div class="backdrop" @click.self="emit('cancel')">
        <section class="dialog panel" role="dialog" aria-modal="true">
            <h2>{{ title }}</h2>
            <p class="muted">{{ message }}</p>
            <div class="actions">
                <button @click="emit('cancel')">{{ cancelLabel }}</button>
                <button class="danger" @click="emit('confirm')">
                    {{ confirmLabel }}
                </button>
            </div>
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
    z-index: 21;
    padding: 1rem;
}

.dialog {
    max-width: min(420px, 100%);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.3rem 1.5rem;
    text-align: center;
}

.dialog h2 {
    font-size: 1.4rem;
    line-height: 1.15;
}

.actions {
    display: flex;
    gap: 0.6rem;
    justify-content: center;
}

.actions button {
    flex: 1;
}
</style>
