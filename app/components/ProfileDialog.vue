<template lang="pug">
.profile-dialog(@click.self="emit('cancel')")
  section.profile-dialog__panel.panel(aria-modal="true" role="dialog")
    h2.profile-dialog__title Chỉnh sửa hồ sơ

    label.profile-dialog__field.stack
      span.profile-dialog__label.muted Biệt danh
      input.profile-dialog__input(
        v-model="nicknameValue"
        autocomplete="nickname"
        autofocus
        maxlength="16"
        placeholder="Hoàng Thượng"
      )

    p.profile-dialog__error.error(v-if="error") {{ error }}

    .profile-dialog__field.stack
      span.profile-dialog__label.muted Ảnh đại diện
      .profile-dialog__avatar-grid
        button.profile-dialog__avatar-choice(
          v-for="id in avatarIds"
          :class="{ 'profile-dialog__avatar-choice--selected': avatarIdValue === id, selected: avatarIdValue === id }"
          :key="id"
          type="button"
          @click="avatarIdValue = id"
        )
          img.profile-dialog__avatar-img(:src="avatarUrl(id)" alt="")

    .profile-dialog__actions
      button.profile-dialog__btn(@click="emit('cancel')") Hủy
      PlaqueButton(
        :disabled="saving"
        :title="saving ? 'Đang lưu…' : 'Lưu'"
        compact
        icon="lucide:save"
        type="button"
        variant="primary"
        @click="save"
      )
</template>

<script setup lang="ts">
  /**
   * Change nickname + avatar. Same backdrop/panel shell as ConfirmDialog.vue;
   * the caller owns the actual network calls (REST session write, then the WS
   * `update-profile` broadcast) and closes the dialog once `save` resolves —
   * `saving` is driven by the caller too, since `emit` is fire-and-forget and
   * cannot itself be awaited to know when that round trip finishes.
   */
  const props = withDefaults(defineProps<{ nickname: string; avatarId: string; saving?: boolean }>(), { saving: false })
  const emit = defineEmits<{
    save: [nickname: string, avatarId: string]
    cancel: []
  }>()

  const nicknameValue = ref(props.nickname)
  const avatarIdValue = ref(props.avatarId)
  const error = ref("")

  const avatarIds = allAvatarIds()

  function save() {
    if (props.saving) return
    const trimmed = nicknameValue.value.trim()
    if (trimmed.length < 2) {
      error.value = "Biệt danh phải có ít nhất 2 ký tự."
      return
    }
    if (trimmed.length > 16) {
      error.value = "Biệt danh tối đa 16 ký tự."
      return
    }
    error.value = ""
    emit("save", trimmed, avatarIdValue.value)
  }
</script>

<style scoped lang="scss">
  .profile-dialog {
    position: fixed;
    inset: 0;
    background: rgb(20 8 0 / 68%);
    backdrop-filter: blur(3px);
    display: grid;
    place-items: center;
    z-index: 21;
    padding: 1rem;

    &__panel {
      max-width: min(440px, 100%);
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1.3rem 1.5rem;
    }

    &__title {
      font-size: 1.4rem;
      line-height: 1.15;
      text-align: center;
    }

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

      :deep(.plaque-btn) {
        width: auto;
      }
    }

    &__btn {
      flex: none;
    }
  }
</style>
