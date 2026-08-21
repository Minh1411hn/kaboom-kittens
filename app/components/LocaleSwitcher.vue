<template lang="pug">
select.locale-switcher(:value="locale" aria-label="Language" @change="setLocale($event.target.value)")
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
  .locale-switcher {
    padding: 0.3rem 0.5rem;
    font-size: 0.82rem;
    background: rgb(0 0 0 / 30%);
    color: var(--text);
    border: 1px solid rgb(255 255 255 / 20%);
    border-radius: 999px;
  }
</style>
