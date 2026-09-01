<template lang="pug">
.see-future(@click.self="!editable && emit('close')")
  section.see-future__panel.panel(aria-modal="true" role="dialog")
    header.see-future__header
      h2.see-future__title
        | {{ editable ? $t('table.see_future.alter_title') : $t('table.see_future.see_title') }}
      p.see-future__subtitle
        | {{ editable ? $t('table.see_future.alter_subtitle') : $t('table.see_future.see_subtitle') }}

    .see-future__choices(ref="choicesEl" :class="{ 'see-future__choices--editable': editable }")
      .see-future__choice-item(v-for="(card, index) in order" :key="card.uid || index")
        span.see-future__rank
          | {{ index === 0 ? $t('table.see_future.top_rank') : `#${index + 1}` }}
        .see-future__card-wrapper
          CardImage(:card-id="card.id" :uid="card.uid" width="100%")
        span.see-future__label {{ cardName(card.id) }}

    p.see-future__empty.muted(v-if="!cards.length") {{ $t('table.see_future.empty') }}

    footer.see-future__footer
      button.see-future__btn.primary(v-if="!editable" type="button" @click="emit('close')") {{ $t('table.see_future.got_it') }}
      button.see-future__btn.primary(v-else type="button" @click="emit( 'submit', order.map((c) => c.uid), )") {{ $t('table.see_future.confirm_order') }}
</template>

<script setup lang="ts">
  import type { Card } from "#shared/types/game"
  import { useSortable } from "@vueuse/integrations/useSortable"

  const props = withDefaults(
    defineProps<{
      cards: Card[]
      /**
       * Alter the Future: cards become drag-reorderable and must be confirmed
       * rather than just acknowledged. Only `alter-the-future-3x`/`5x` use the
       * `reorder-cards` interaction kind today (see server/game/cards/alter-the-future.ts) —
       * if a future card ever reuses that kind, double check this dialog's
       * hardcoded Vietnamese copy still fits before wiring it up the same way.
       */
      editable?: boolean
    }>(),
    { editable: false }
  )

  const emit = defineEmits<{
    close: []
    submit: [uids: string[]]
  }>()

  const { cardName } = useCardText()

  // --- editable / drag-to-reorder ---------------------------------------------
  //
  // A hand-rolled first pass here (inline `position: fixed` on a TransitionGroup
  // child, driven by our own pointer-move geometry) fought with Vue's own FLIP
  // bookkeeping and never dragged freely. useSortable (VueUse's wrapper around
  // SortableJS) owns the whole gesture instead — free movement, live insertion
  // gap, touch support — and keeps `order` in sync with the DOM via its default
  // `onUpdate` (do not pass a custom `onUpdate` in the options below, or that
  // sync is lost). `order` is the single source of truth for the rendered list
  // in both modes. Read-only updates are synced below; editable updates stay
  // local so an unrelated snapshot cannot undo a drag in progress.

  const order = ref<Card[]>([...props.cards])
  const choicesEl = ref<HTMLElement | null>(null)

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
    dragClass: "reorder-dragging"
  })

  // Projection returns a fresh array on every snapshot. Compare the ordered
  // uid sequence so read-only peeks update only when their contents or order
  // actually changes, while editable order remains owned by SortableJS.
  watch(
    () => JSON.stringify(props.cards.map((card) => card.uid)),
    () => {
      if (!props.editable) order.value = [...props.cards]
    }
  )
</script>

<style scoped lang="scss">
  .see-future {
    position: fixed;
    inset: 0;
    background: rgb(20 8 0 / 68%);
    backdrop-filter: blur(3px);
    display: grid;
    place-items: center;
    z-index: 20;
    padding: 1rem;
    animation: backdrop-fade 0.2s ease;

    &__panel {
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

    &__header {
      position: relative;
    }

    &__title {
      font-size: 1.4rem;
      line-height: 1.2;
      margin: 0;
    }

    &__subtitle {
      margin: 0.35rem 0 0;
      font-size: 0.95rem;
      color: #4a3622;
      font-weight: 500;
    }

    &__choices {
      display: grid;
      grid-template-columns: repeat(v-bind("order.length || 1"), minmax(0, 156px));
      justify-content: center;
      align-items: start;
      gap: 1rem;
      padding: 0.5rem 0;

      &--editable {
        .see-future__choice-item {
          cursor: grab;
          touch-action: none;
        }

        .see-future__card-wrapper:hover {
          transform: none;
          z-index: auto;
        }
      }
    }

    &__choice-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
      min-width: 0;
    }

    &__rank {
      font-family: var(--font-display);
      font-size: 0.82rem;
      color: #a5201a;
      letter-spacing: 0.5px;
      font-weight: 700;
    }

    &__card-wrapper {
      width: 100%;
      border-radius: var(--card-radius);
      transition: transform 0.15s ease;
      position: relative;

      &:hover {
        transform: translateY(-4px) scale(1.175);
        z-index: 10;
      }
    }

    &__label {
      width: 100%;
      font-size: 0.85rem;
      color: #2c2117;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &__empty {
      // empty state
    }

    &__footer {
      display: flex;
      justify-content: center;
      margin-top: 0.2rem;
    }

    &__btn {
      // button state
    }
  }

  .reorder-ghost {
    opacity: 0.35;
  }

  .reorder-chosen {
    cursor: grabbing;
  }

  .reorder-dragging {
    cursor: grabbing;
    rotate: -4deg;
    filter: drop-shadow(0 18px 30px rgb(20 8 0 / 55%));
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
