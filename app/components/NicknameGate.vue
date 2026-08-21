<template lang="pug">
form.nickname-gate.panel(@submit.prevent="submit")
  .nickname-gate__top
    LocaleSwitcher
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
 * This gate is the entry point to both the landing page and a room link,
 * always before a game exists — so it always gets the red/maroon menu
 * look, self-contained here rather than relying on the global `.panel`
 * (which stays wood/parchment for the live game table).
 */
  .nickname-gate {
    position: relative;
    max-width: 440px;
    margin: 12vh auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.6rem 1.8rem;
    background: linear-gradient(160deg, rgb(122 20 20 / 55%), rgb(61 10 12 / 78%));
    border: 2px solid var(--maroon-edge);
    color: var(--text);
    box-shadow:
      var(--shadow),
      inset 0 0 0 1px rgb(255 255 255 / 8%);

    &__top {
      display: flex;
      justify-content: flex-end;
    }

    &__title {
      font-size: 2.4rem;
      line-height: 1.05;
      text-align: center;
      color: var(--accent);
      text-shadow:
        -2px -2px 0 var(--outline),
        2px -2px 0 var(--outline),
        -2px 2px 0 var(--outline),
        2px 2px 0 var(--outline);
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
      color: var(--text);
      background: linear-gradient(180deg, var(--red-3), #2c0708);
      border: 2px solid var(--maroon-edge);
      box-shadow: inset 0 2px 5px rgb(0 0 0 / 45%);

      &::placeholder {
        color: var(--text-dim);
        opacity: 0.7;
      }
    }

    &__error {
      color: var(--bad);
    }
  }
</style>
