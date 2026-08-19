<template lang="pug">
button.current-user(:class="{ 'current-user--static': !clickable }" :disabled="!clickable" @click="$emit('click')")
  PlayerAvatar(:avatar-id="avatarId" :size="32")
  span.current-user__nick {{ nickname }}
</template>

<script setup lang="ts">
  /**
   * Avatar + nickname, shared between the home header and the waiting-room
   * topbar. `clickable` gates whether it opens the profile dialog — the room
   * page only allows that while the room is in the waiting-room state.
   */
  withDefaults(
    defineProps<{
      nickname: string
      avatarId: string
      clickable?: boolean
    }>(),
    { clickable: true }
  )

  defineEmits<{ click: [] }>()
</script>

<style scoped lang="scss">
  .current-user {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.7rem 0.3rem 0.3rem;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 999px;
    color: var(--text);
    font-size: 0.9rem;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;

    &:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.5);
      border-color: rgba(255, 255, 255, 0.3);
      filter: none;
    }

    &--static {
      cursor: default;
    }

    &:disabled {
      opacity: 1;
    }

    &__nick {
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }
  }
</style>
