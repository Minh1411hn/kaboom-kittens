<template lang="pug">
form.nickname-gate.panel(@submit.prevent="submit")
  .nickname-gate__top
    CommonLangSelect
  h1.nickname-gate__title
    Icon(aria-hidden="true" name="lucide:cat")
    |
    | Kaboom Kitten
  p.nickname-gate__subtitle.muted
    | {{ $t('app.nickname_gate.subtitle') }}

  label.nickname-gate__field.stack
    span.nickname-gate__label.muted {{ $t('app.nickname_label') }}
    input.nickname-gate__input(
      v-model="value"
      autocomplete="nickname"
      autofocus
      maxlength="16"
      :placeholder="$t('app.nickname_placeholder')"
    )

  p.nickname-gate__error.error {{ error }}

  PlaqueButton(
    :disabled="busy || value.trim().length < 2"
    :title="busy ? $t('app.nickname_gate.processing') : $t('app.nickname_gate.enter')"
    chevron
    icon="lucide:paw-print"
    type="submit"
    variant="primary"
  )
</template>

<script setup lang="ts">
  const emit = defineEmits<{ done: [] }>()
  const { setNickname, remembered } = useSession()
  const { t } = useI18n()

  const value = ref("")
  const error = ref("")
  const busy = ref(false)

  onMounted(() => {
    value.value = remembered()
  })

  async function submit() {
    if (busy.value) return
    busy.value = true
    error.value = ""
    try {
      await setNickname(value.value)
      emit("done")
    } catch (caught) {
      const code = (caught as { data?: { data?: { code?: string } } }).data?.data?.code
      error.value = code ? t(`errors.${code}`) : t("app.nickname_gate.fallback_error")
    } finally {
      busy.value = false
    }
  }
</script>

<style scoped lang="scss">
  /*
 * The gate is the entry point to both the landing page and a room link, so it
 * carries the same card look as everything else on the cream field: a thick ink
 * outline over `$cream-card`, spelled out here rather than borrowed from the
 * global `.panel`, because it also owns its own width and rhythm.
 */
  .nickname-gate {
    position: relative;
    max-width: 440px;
    margin: 12vh auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.6rem 1.8rem;
    background: $cream-card;
    border: $outline-width solid $ink;
    border-radius: $radius;
    color: $ink;
    box-shadow: $shadow;

    &__top {
      display: flex;
      justify-content: flex-end;
    }

    &__title {
      font-size: 2.4rem;
      line-height: 1.05;
      text-align: center;
      color: $ink;
    }

    &__subtitle {
      text-align: center;
      margin: 0;
      color: var(--text-dim);
    }

    &__field {
      // inherits .stack flex column
    }

    &__label {
      color: var(--text-dim);
    }

    &__input {
      color: $ink;
      background: $cream;
      border: $outline-width solid $ink;

      &::placeholder {
        color: $ink-dim;
      }
    }

    &__error {
      color: var(--bad);
    }
  }
</style>
