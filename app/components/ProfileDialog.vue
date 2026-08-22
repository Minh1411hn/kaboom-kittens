<template lang="pug">
CommonDialog(:open="open" @close="emit('cancel')")
  template(#title)
    h2.profile-dialog__title {{ $t("app.profile_dialog.title") }}

  .profile-dialog
    label.profile-dialog__field.stack
      span.profile-dialog__label.muted {{ $t("app.nickname_label") }}
      input.profile-dialog__input(
        v-model="nicknameValue"
        :placeholder="$t('app.nickname_placeholder')"
        autocomplete="nickname"
        autofocus
        maxlength="16"
      )

    p.profile-dialog__error.error(v-if="error") {{ error }}

    .profile-dialog__field.stack
      span.profile-dialog__label.muted {{ $t("app.profile_dialog.avatar_label") }}
      .profile-dialog__avatar-grid
        button.profile-dialog__avatar-choice(
          v-for="id in avatarIds"
          :class="{ 'profile-dialog__avatar-choice--selected': avatarIdValue === id, selected: avatarIdValue === id }"
          :key="id"
          type="button"
          @click="avatarIdValue = id"
        )
          img.profile-dialog__avatar-img(:src="avatarUrl(id)" alt="")

    .profile-dialog__field.stack
      span.profile-dialog__label.muted {{ $t("app.language_label") }}
      CommonLangSelect

    .profile-dialog__actions
      CommonButton(:label="$t('app.cancel')" variant="red" @click="emit('cancel')")
      CommonButton(
        :disabled="saving"
        :label="$t('app.profile_dialog.save')"
        :loading="saving"
        icon="lucide:save"
        type="button"
        variant="yellow"
        @click="save"
      )
</template>

<script setup lang="ts">
  /**
   * Change nickname, avatar, and language. Chrome (backdrop, panel, focus trap)
   * now lives in `common/Dialog.vue` — the caller owns the actual network calls
   * (REST session write, then the WS `update-profile` broadcast) and closes the
   * dialog once `save` resolves — `saving` is driven by the caller too, since
   * `emit` is fire-and-forget and cannot itself be awaited to know when that
   * round trip finishes.
   */
  const props = withDefaults(defineProps<{ open: boolean; nickname: string; avatarId: string; saving?: boolean }>(), {
    saving: false
  })
  const emit = defineEmits<{
    save: [nickname: string, avatarId: string]
    cancel: []
  }>()

  const nicknameValue = ref(props.nickname)
  const avatarIdValue = ref(props.avatarId)
  const error = ref("")

  const avatarIds = allAvatarIds()
  const { t } = useI18n()

  function save() {
    if (props.saving) return
    const trimmed = nicknameValue.value.trim()
    if (trimmed.length < 2) {
      error.value = t("app.profile_dialog.nickname_too_short")
      return
    }
    if (trimmed.length > 16) {
      error.value = t("app.profile_dialog.nickname_too_long")
      return
    }
    error.value = ""
    emit("save", trimmed, avatarIdValue.value)
  }
</script>

<style scoped lang="scss">
  // The dialog's own card chrome (outline, shadow, width, padding) now lives in
  // `common/Dialog.vue` — this scoped block only owns the layout inside it.
  .profile-dialog {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    &__field {
      // inherits .stack flex column
    }

    &__label {
      // inherits .muted
    }

    &__input {
      // inherits input styling
    }

    &__error {
      // inherits .error styling
    }

    &__avatar-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
      gap: 0.5rem;
      max-height: 260px;
      overflow-y: auto;
      padding: 0.15rem;
    }

    &__avatar-choice {
      padding: 0;
      border: 3px solid transparent;
      border-radius: 50%;
      background: none;
      box-shadow: none;
      cursor: pointer;
      line-height: 0;

      &:hover:not(:disabled) {
        filter: brightness(1.1);
      }

      &--selected,
      &.selected {
        border-color: var(--warn);
      }
    }

    &__avatar-img {
      width: 100%;
      aspect-ratio: 1;
      border-radius: 50%;
      object-fit: cover;
      display: block;
    }

    &__actions {
      display: flex;
      gap: 0.6rem;
      justify-content: center;
    }
  }
</style>
