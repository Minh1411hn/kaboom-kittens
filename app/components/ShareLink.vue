<template lang="pug">
.share-link
  input.share-link__input(:value="link" aria-label="Liên kết phòng" readonly @focus="$event.target.select()")
  button.share-link__button(@click="copy")
    template(v-if="copied")
      Icon(aria-hidden="true" name="lucide:check")
      |
      | Đã sao chép
    template(v-else)
      | Sao chép link
</template>

<script setup lang="ts">
  const props = defineProps<{ roomId: string }>()

  const copied = ref(false)
  const link = computed(() => {
    const base = import.meta.client ? location.origin : (useRuntimeConfig().public.baseUrl as string)
    return `${base}/room/${props.roomId}`
  })

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.value)
    } catch {
      // Clipboard is blocked outside a secure context; the input is selectable.
      return
    }
    copied.value = true
    setTimeout(() => (copied.value = false), 1800)
  }
</script>

<style scoped lang="scss">
  /*
 * Only ever rendered inside the pre-game waiting room, so it always gets
 * the red/maroon look — self-contained, doesn't rely on an ancestor class.
 */
  .share-link {
    display: flex;
    gap: 0.5rem;

    &__input {
      flex: 1;
      font-size: 0.85rem;
      color: var(--text-dim);
      background: linear-gradient(180deg, var(--red-3), #2c0708);
      border: 2px solid var(--maroon-edge);
      box-shadow: inset 0 2px 5px rgb(0 0 0 / 45%);
    }

    &__button {
      white-space: nowrap;
      background: linear-gradient(180deg, var(--maroon-1), var(--maroon-2));
    }
  }
</style>
