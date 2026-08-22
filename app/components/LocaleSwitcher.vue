<template lang="pug">
  label.locale-switcher
    Icon.locale-switcher__icon(aria-hidden="true" name="lucide:languages")
    select.locale-switcher__select(
      :aria-label="$t('app.language_label')"
      :value="locale"
      @change="setLocale($event.target.value)"
    )
      option(v-for="loc in availableLocales" :key="loc" :value="loc") {{ localeLabel(loc) }}
</template>

<script setup lang="ts">
  const { locale, locales, setLocale } = useI18n()

  const availableLocales = computed(() => locales.value.map((l) => (typeof l === "string" ? l : l.code)))

  function localeLabel(code: string): string {
    const found = locales.value.find((l) => (typeof l === "string" ? l === code : l.code === code))
    return typeof found === "string" || !found ? code : (found.name ?? code)
  }
</script>

<style scoped lang="scss">
  // Same pill/outline/shadow language as CommonButton, sized to sit next to its
  // `size="sm"` icon buttons in the header actions slot.
  .locale-switcher {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.85rem;
    background: $cream-card;
    color: $ink;
    border: $outline-width solid $ink;
    border-radius: 999px;
    box-shadow: 0 3px 0 $ink;
    cursor: pointer;

    &__icon {
      flex: none;
      font-size: 1.1em;
    }

    &__select {
      appearance: none;
      background: transparent;
      border: none;
      color: $ink;
      font-family: $font-display;
      font-weight: 600;
      font-size: 0.85rem;
      letter-spacing: 0.4px;
      cursor: pointer;

      &:focus-visible {
        outline: 3px solid $ink;
        outline-offset: 3px;
      }
    }
  }
</style>
