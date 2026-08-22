<template lang="pug">
button.btn(
  :aria-label="accessibleName"
  :class="[`btn--${variant}`, `btn--${size}`, { 'btn--icon-only': iconOnly, 'btn--loading': loading }]"
  :disabled="disabled || loading"
  :title="iconOnly ? accessibleName : undefined"
  :type="type"
  @click="$emit('click', $event)"
)
  Icon.btn__icon.btn__icon--spin(v-if="loading" aria-hidden="true" name="lucide:loader-circle")
  Icon.btn__icon(v-else-if="icon" :name="icon" aria-hidden="true")
  span.btn__label(v-if="label") {{ label }}
</template>

<script setup lang="ts">
  /**
   * The one button of the app — a cream-era pill with a thick ink outline and a
   * hard, blur-free drop shadow. Drop `label` and it becomes the round icon
   * button from the top-right of the home screen instead.
   *
   * Its whole look lives in the scoped block below, on purpose: this component
   * is meant to be reached for everywhere, so nothing about it should depend on
   * a global rule or a shared mixin. That also means the block has to restate
   * every property `main.css`'s bare `button { … }` sets — that rule is
   * unlayered and matches with the same specificity as a class.
   */
  const props = withDefaults(
    defineProps<{
      /** Visible text. Omit it for a round, icon-only button. */
      label?: string
      /** Iconify icon name, e.g. `lucide:users`. */
      icon?: string
      /** Accessible name. Required when there is no `label` to read. */
      ariaLabel?: string
      variant?: "gold" | "red" | "ghost"
      size?: "sm" | "md" | "lg"
      disabled?: boolean
      loading?: boolean
      type?: "button" | "submit"
    }>(),
    {
      label: undefined,
      icon: undefined,
      ariaLabel: undefined,
      variant: "gold",
      size: "md",
      disabled: false,
      loading: false,
      type: "button"
    }
  )

  defineEmits<{ click: [MouseEvent] }>()

  const iconOnly = computed(() => !props.label)

  const accessibleName = computed(() => props.ariaLabel ?? props.label)

  if (import.meta.dev) {
    watchEffect(() => {
      if (!props.label && !props.ariaLabel) {
        console.warn("[CommonButton] icon-only button has no accessible name — pass `ariaLabel`.")
      }
    })
  }
</script>

<style scoped lang="scss">
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-family: $font-display;
    font-weight: 600;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    line-height: 1;
    white-space: nowrap;
    border: $outline-width solid $ink;
    border-radius: 999px;
    box-shadow: $shadow-sm;
    cursor: pointer;
    transition:
      transform 0.08s ease,
      filter 0.15s ease,
      box-shadow 0.15s ease;

    &:hover:not(:disabled) {
      filter: brightness(1.06);
    }

    &:active:not(:disabled) {
      transform: translateY(3px);
      box-shadow: 0 1px 0 $ink;
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &:focus-visible {
      outline: 3px solid $ink;
      outline-offset: 3px;
    }

    // Fills
    &--gold {
      background: linear-gradient(180deg, $gold-1, $gold-2);
      color: $ink;
    }

    &--red {
      background: linear-gradient(180deg, $brick-1, $brick-2);
      color: $cream;
    }

    &--ghost {
      background: $cream-card;
      color: $ink;
    }

    // Sizes
    &--sm {
      padding: 0.4rem 0.95rem;
      font-size: 0.85rem;
      box-shadow: $shadow-xs;
    }

    &--md {
      padding: 0.6rem 1.3rem;
      font-size: 1rem;
      box-shadow: $shadow-xs;
    }

    &--lg {
      padding: 0.85rem 2rem;
      font-size: 1.35rem;
    }

    // A square-ish footprint plus a full round makes the circle from the mockup.
    &--icon-only {
      gap: 0;
      aspect-ratio: 1;
      border-radius: 50%;

      &.btn--sm {
        padding: 0.4rem;
      }

      &.btn--md {
        padding: 0.55rem;
      }

      &.btn--lg {
        padding: 0.75rem;
      }
    }

    &__icon {
      flex: none;
      font-size: 1.2em;

      &--spin {
        animation: btn-spin 0.9s linear infinite;
      }
    }

    &__label {
      // overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  @keyframes btn-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
