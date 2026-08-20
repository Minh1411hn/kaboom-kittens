<template lang="pug">
  header.app-header
    .app-header__side
      slot(name="left")

    .app-header__side.app-header__side--end
      span.app-header__status(
        :class="`app-header__status--${status}`"
        :title="`Trạng thái kết nối: ${status}`"
      )
      CurrentUserButton(
        :avatar-id="avatarId"
        :clickable="clickable"
        :nickname="nickname"
        @click="$emit('profile-click')"
      )
      slot(name="actions")
</template>

<script setup lang="ts">
  /**
   * The bar that runs across the top of every screen: whatever the page puts in
   * the `left` slot, then the connection light, who you are, and the page's own
   * icon buttons in `actions`.
   *
   * It owns no dialog of its own — `profile-click` is only emitted while
   * `clickable`, so a page that cannot change the profile right now (the room,
   * mid-game) just leaves the handler unused rather than guarding the call.
   */
  withDefaults(
    defineProps<{
      nickname: string
      avatarId: string
      /** The socket's state, straight from `useGameSocket`. */
      status: string
      /** Whether the avatar opens the profile dialog. */
      clickable?: boolean
    }>(),
    { clickable: true }
  )

  defineEmits<{ "profile-click": [] }>()
</script>

<style scoped lang="scss">
  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;

    &__side {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      min-width: 0;

      &--end {
        flex: none;
        justify-content: flex-end;
      }
    }

    &__status {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: $ink-dim;

      &--open {
        background: $good;
      }

      &--connecting {
        background: $warn;
      }

      &--closed {
        background: $bad;
      }
    }
  }
</style>
