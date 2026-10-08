<template lang="pug">
.play-mode(:aria-label="$t('table.play_mode.label')" role="radiogroup")
  button.play-mode__option.play-mode__option--play(
    :aria-checked="!spectate"
    :class="{ 'play-mode__option--active': !spectate }"
    role="radio"
    type="button"
    @click="emit('change', false)"
  )
    Icon(aria-hidden="true" name="lucide:gamepad-2")
    |
    | {{ $t("table.play_mode.play") }}
  button.play-mode__option.play-mode__option--spectate(
    :aria-checked="spectate"
    :class="{ 'play-mode__option--active': spectate }"
    role="radio"
    type="button"
    @click="emit('change', true)"
  )
    Icon(aria-hidden="true" name="lucide:eye")
    |
    | {{ $t("table.play_mode.spectate") }}
</template>

<script setup lang="ts">
  /**
   * Play or just watch, chosen in the waiting room. Purely a control: the page
   * owns the preference and resends it with every `join`, which is what makes
   * it survive a refresh or a reconnect.
   */
  defineProps<{ spectate: boolean }>()

  const emit = defineEmits<{ change: [spectate: boolean] }>()
</script>

<style scoped lang="scss">
  .play-mode {
    display: inline-flex;
    padding: 3px;
    border: calc($outline-width - 1px) solid $ink;
    border-radius: 999px;
    background: $cream;

    &__option {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.4rem 1rem;
      border: 0;
      border-radius: 999px;
      background: transparent;
      box-shadow: none;
      color: $ink-dim;
      font-family: var(--font-display);
      text-transform: uppercase;
      letter-spacing: 0.3px;

      &--active {
        background: $ink;
        color: $cream;
      }
    }
  }
</style>
