<template lang="pug">
.confirm-dialog(@click.self="emit('cancel')")
  section.confirm-dialog__panel.panel(aria-modal="true" role="dialog")
    h2.confirm-dialog__title {{ title }}
    p.confirm-dialog__message.muted {{ message }}
    .confirm-dialog__actions
      button.confirm-dialog__btn(@click="emit('cancel')") {{ cancelText }}
      button.confirm-dialog__btn.confirm-dialog__btn--danger.danger(@click="emit('confirm')") {{ confirmText }}
</template>

<script setup lang="ts">
  /**
   * A small, generic confirm/cancel prompt. Follows the same backdrop+panel
   * pattern as InteractionModal.vue, one z-index above it so it always wins
   * any stacking (e.g. confirming a quit while an interaction happens to be
   * open).
   */
  const props = defineProps<{
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
  }>()

  const emit = defineEmits<{ confirm: []; cancel: [] }>()

  const { t } = useI18n()
  const confirmText = computed(() => props.confirmLabel ?? t("app.confirm"))
  const cancelText = computed(() => props.cancelLabel ?? t("app.cancel"))
</script>

<style scoped lang="scss">
  .confirm-dialog {
    position: fixed;
    inset: 0;
    background: rgb(20 8 0 / 68%);
    backdrop-filter: blur(3px);
    display: grid;
    place-items: center;
    z-index: 21;
    padding: 1rem;

    &__panel {
      max-width: min(420px, 100%);
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1.3rem 1.5rem;
      text-align: center;
    }

    &__title {
      font-size: 1.4rem;
      line-height: 1.15;
    }

    &__message {
      // inherits .muted color from panel
    }

    &__actions {
      display: flex;
      gap: 0.6rem;
      justify-content: center;
    }

    &__btn {
      flex: 1;

      &--danger {
        // Danger button style inherited from global button.danger
      }
    }
  }
</style>
