<template lang="pug">
CommonModal(:open="open" persistent)
  template(#title)
    h1.nickname-gate__title
      Icon(aria-hidden="true" name="lucide:cat")
      |
      | Kaboom Kitten

  .nickname-gate
    .nickname-gate__top
      CommonLangSelect
    p.nickname-gate__subtitle.muted
      | {{ $t('app.nickname_gate.subtitle') }}

    form.nickname-gate__form(@submit.prevent="submit")
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

      CommonButton(
        :disabled="busy || value.trim().length < 2"
        :label="busy ? $t('app.nickname_gate.processing') : $t('app.nickname_gate.enter')"
        :loading="busy"
        type="submit"
        variant="gold"
      )
</template>

<script setup lang="ts">
  defineProps<{
    /** Visibility — the parent shows this once a session is ready but has no nickname yet. */
    open: boolean
  }>()

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
 * The gate's own card chrome (outline, shadow, width, padding) now lives in
 * `common/Modal.vue` — this scoped block only owns the layout inside it.
 */
  .nickname-gate {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    &__top {
      display: flex;
      justify-content: flex-end;
    }

    &__subtitle {
      text-align: center;
      margin: 0;
      color: var(--text-dim);
    }

    &__form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
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

  .nickname-gate__title {
    font-size: 2.4rem;
    line-height: 1.05;
    text-align: center;
    color: $ink;
  }
</style>
