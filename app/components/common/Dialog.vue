<template lang="pug">
Teleport(to="body")
  TransitionRoot(:show="open" appear as="template")
    Dialog.modal(as="div" @close="handleClose")
      TransitionChild(
        as="template"
        enter="modal__backdrop-fade"
        enter-from="modal__backdrop-fade--from"
        enter-to="modal__backdrop-fade--to"
        leave="modal__backdrop-fade"
        leave-from="modal__backdrop-fade--to"
        leave-to="modal__backdrop-fade--from"
      )
        .modal__backdrop
      .modal__wrapper
        TransitionChild(
          as="template"
          enter="modal__panel-fade"
          enter-from="modal__panel-fade--from"
          enter-to="modal__panel-fade--to"
          leave="modal__panel-fade"
          leave-from="modal__panel-fade--to"
          leave-to="modal__panel-fade--from"
        )
          DialogPanel.modal__panel(:class="panelClass")
            DialogTitle(v-if="title || $slots.title" as="template")
              slot(name="title")
                h2.modal__title {{ title }}
            slot
</template>

<script setup lang="ts">
  /**
   * The one dialog of the app — a Headless UI `Dialog` wearing the same thick
   * ink outline, cream card, and hard drop shadow as every hand-rolled overlay
   * here (`ConfirmDialog.vue`, `ProfileDialog.vue`, ...). New dialogs should
   * reach for this instead of duplicating that backdrop/panel CSS: `Dialog`
   * supplies the focus trap, Escape handling, and outside-click detection for
   * free — this component only supplies the look and the slots.
   *
   * `persistent` exists for flows with no cancel path (the nickname prompt is
   * the first one) — it swallows `Dialog`'s `@close` (Escape / outside click)
   * instead of forwarding it, so the only way out is whatever the slotted
   * content does (e.g. a successful form submit).
   */
  import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from "@headlessui/vue"

  const props = withDefaults(
    defineProps<{
      /** Visibility, controlled by the parent. */
      open: boolean
      /** Plain-text title, rendered as `DialogTitle`. Ignored if the `title` slot is used. */
      title?: string
      /** When true, Escape and clicking outside the panel do not close it. */
      persistent?: boolean
      /** Extra class for the panel, e.g. to override its default max-width. */
      panelClass?: string
    }>(),
    {
      title: undefined,
      persistent: false,
      panelClass: undefined
    }
  )

  const emit = defineEmits<{ close: [] }>()

  function handleClose() {
    if (!props.persistent) emit("close")
  }
</script>

<style scoped lang="scss">
  .modal {
    &__backdrop {
      position: fixed;
      inset: 0;
      z-index: 21;
      background: rgb(20 8 0 / 68%);
      backdrop-filter: blur(3px);
    }

    &__wrapper {
      position: fixed;
      inset: 0;
      z-index: 21;
      display: grid;
      place-items: center;
      padding: 1rem;
      overflow-y: auto;
    }

    &__panel {
      @include card;
      width: 100%;
      max-width: min(440px, 100%);
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1.6rem 1.8rem;
    }

    &__title {
      margin: 0;
      font-size: 1.4rem;
      line-height: 1.15;
      text-align: center;
      color: $ink;
    }

    &__backdrop-fade,
    &__panel-fade {
      transition:
        opacity 0.15s ease,
        transform 0.15s ease;
    }

    &__backdrop-fade--from {
      opacity: 0;
    }

    &__backdrop-fade--to {
      opacity: 1;
    }

    &__panel-fade--from {
      opacity: 0;
      transform: scale(0.96);
    }

    &__panel-fade--to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
