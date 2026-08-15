<script setup lang="ts">
const emit = defineEmits<{ done: [] }>()
const { setNickname, remembered } = useSession()

const value = ref('')
const error = ref('')
const busy = ref(false)

onMounted(() => {
  value.value = remembered()
})

async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await setNickname(value.value)
    emit('done')
  } catch (caught) {
    const message = (caught as { statusMessage?: string; message?: string })
    error.value = message.statusMessage ?? message.message ?? 'Biệt danh không hợp lệ hoặc đã bị từ chối.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="gate panel" @submit.prevent="submit">
    <h1>🙀 Kaboom Kitten</h1>
    <p class="muted">Mèo Cảm Tử online dành cho 2–10 người chơi. Hãy chọn biệt danh để bắt đầu.</p>

    <label class="stack">
      <span class="muted">Biệt danh</span>
      <input
        v-model="value"
        maxlength="16"
        autocomplete="nickname"
        placeholder="Hoàng Thượng"
        autofocus
      />
    </label>

    <p class="error">{{ error }}</p>

    <PlaqueButton
      type="submit"
      :title="busy ? 'Đang xử lý…' : 'Vào sảnh chờ'"
      icon="🐾"
      variant="primary"
      chevron
      :disabled="busy || value.trim().length < 2"
    />
  </form>
</template>

<style scoped>
/*
 * This gate is the entry point to both the landing page and a room link,
 * always before a game exists — so it always gets the red/maroon menu
 * look, self-contained here rather than relying on the global `.panel`
 * (which stays wood/parchment for the live game table).
 */
.gate {
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
  box-shadow: var(--shadow), inset 0 0 0 1px rgb(255 255 255 / 8%);
}

.gate input {
  color: var(--text);
  background: linear-gradient(180deg, var(--red-3), #2c0708);
  border: 2px solid var(--maroon-edge);
  box-shadow: inset 0 2px 5px rgb(0 0 0 / 45%);
}

.gate input::placeholder {
  color: var(--text-dim);
  opacity: 0.7;
}

.gate .muted {
  color: var(--text-dim);
}

.gate .error {
  color: var(--bad);
}

h1 {
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

.gate > .muted {
  text-align: center;
  margin: 0;
}
</style>
