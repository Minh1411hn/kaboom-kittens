<template lang="pug">
  div.lang-select
    Listbox(:model-value="locale" @update:model-value="setLocale" v-slot="{ open }")
      ListboxButton.lang-select__button(:aria-label="$t('app.language_label')")
        Icon.lang-select__icon(aria-hidden="true" name="lucide:languages")
        span.lang-select__value {{ localeLabel(locale) }}
        Icon.lang-select__chevron(
          :class="{ 'lang-select__chevron--open': open }"
          aria-hidden="true"
          name="lucide:chevron-down"
        )
      Transition(
        enter-active-class="lang-select__options-enter-active"
        enter-from-class="lang-select__options-enter-from"
        enter-to-class="lang-select__options-enter-to"
        leave-active-class="lang-select__options-leave-active"
        leave-from-class="lang-select__options-leave-from"
        leave-to-class="lang-select__options-leave-to"
      )
        ListboxOptions.lang-select__options
          ListboxOption(
            v-for="loc in availableLocales"
            v-slot="{ active, selected }"
            :key="loc.code"
            :value="loc.code"
            as="template"
          )
            li.lang-select__option(
              :class="{ 'lang-select__option--active': active, 'lang-select__option--selected': selected }"
            )
              span.lang-select__option-label {{ loc.name }}
              Icon.lang-select__check(v-if="selected" aria-hidden="true" name="lucide:check")
</template>

<script setup lang="ts">
  /**
   * Headless UI Listbox standing in for a native <select>, so the option panel
   * can carry this app's own pill/outline/shadow look (and a check mark)
   * instead of the browser's un-stylable native popup. Wiring mirrors the old
   * LocaleSwitcher.vue: `setLocale` (not `v-model="locale"`) is what actually
   * persists the `kk_locale` cookie, so the Listbox is driven explicitly via
   * :model-value / @update:model-value rather than two-way-bound to the ref.
   */
  import { Listbox, ListboxButton, ListboxOptions, ListboxOption } from "@headlessui/vue"

  const { locale, locales, setLocale } = useI18n()

  const availableLocales = computed(() =>
    locales.value.map((l) => (typeof l === "string" ? { code: l, name: l } : { code: l.code, name: l.name ?? l.code }))
  )

  function localeLabel(code: string): string {
    const found = availableLocales.value.find((l) => l.code === code)
    return found?.name ?? code
  }
</script>

<style scoped lang="scss">
  // Same pill/outline/shadow language as CommonButton, sized to sit next to its
  // `size="sm"` icon buttons in the header actions slot.
  .lang-select {
    position: relative;
    display: inline-block;

    &__button {
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
      font-family: $font-display;
      font-weight: 600;
      font-size: 0.85rem;
      letter-spacing: 0.4px;

      &:hover {
        filter: brightness(1.06);
      }

      &:focus-visible {
        outline: 3px solid $ink;
        outline-offset: 3px;
      }
    }

    &__icon {
      flex: none;
      font-size: 1.1em;
    }

    &__chevron {
      flex: none;
      font-size: 0.9em;
      transition: transform 0.15s ease;

      &--open {
        transform: rotate(180deg);
      }
    }

    &__options {
      position: absolute;
      top: calc(100% + 0.5rem);
      right: 0;
      z-index: 10;
      min-width: 100%;
      margin: 0;
      padding: 0.35rem;
      list-style: none;
      background: $cream-card;
      border: $outline-width solid $ink;
      border-radius: $radius;
      box-shadow: $shadow-sm;
    }

    // headlessui renders ListboxOption `as="template"` — its slot content
    // (this <li>) is the only real DOM node, so it carries active/hover state.
    &__option {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.45rem 0.6rem;
      border-radius: calc($radius - 6px);
      color: $ink;
      font-family: $font-display;
      font-weight: 600;
      font-size: 0.85rem;
      letter-spacing: 0.4px;
      white-space: nowrap;
      cursor: pointer;

      &--active {
        background: $gold-1;
      }

      &--selected {
        font-weight: 700;
      }
    }

    &__check {
      flex: none;
      font-size: 1em;
    }

    &__options-enter-active,
    &__options-leave-active {
      transition:
        opacity 0.12s ease,
        transform 0.12s ease;
    }

    &__options-enter-from,
    &__options-leave-to {
      opacity: 0;
      transform: translateY(-4px);
    }

    &__options-enter-to,
    &__options-leave-from {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
