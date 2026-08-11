<script setup lang="ts">
import type { RoomSummary } from '#shared/protocol/messages'

const { nickname, ready, load } = useSession()
const { rooms, connect, send, status, error, resetRoom } = useGameSocket()

const creating = ref(false)
const newRoomName = ref('')

await load()

// Paint the list server-side; the socket keeps it live from then on.
const { data: initialRooms } = await useFetch<{ rooms: RoomSummary[] }>('/api/rooms')
if (initialRooms.value?.rooms) rooms.value = initialRooms.value.rooms

onMounted(() => {
  resetRoom()
  if (nickname.value) start()
})

function start() {
  connect()
  // The socket may still be opening; useGameSocket buffers until it is not.
  send({ type: 'watch-lobby' })
}

function onNicknameSet() {
  start()
}

async function createRoom() {
  if (creating.value) return
  creating.value = true
  try {
    const { roomId } = await $fetch<{ roomId: string }>('/api/rooms', {
      method: 'POST',
      body: { name: newRoomName.value.trim() || undefined },
    })
    await navigateTo(`/room/${roomId}`)
  } catch (caught) {
    error.value =
      (caught as { statusMessage?: string }).statusMessage ?? 'Could not create the room.'
  } finally {
    creating.value = false
  }
}

const openRooms = computed(() => rooms.value.filter((room) => room.status !== 'over'))

function since(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.round(minutes / 60)}h ago`
}
</script>

<template>
  <div class="page">
    <NicknameGate v-if="ready && !nickname" @done="onNicknameSet" />

    <template v-else-if="ready">
      <header class="header">
        <div class="hero">
          <img src="/common/mascot-kitten.svg" alt="" class="mascot" />
          <h1 class="hero-title">
            <span class="line line-gold">Kaboom</span>
            <span class="line line-white">Kitten</span>
          </h1>
        </div>
        <div class="row status-row">
          <span class="muted">Playing as <strong>{{ nickname }}</strong></span>
          <span class="dot" :class="status" :title="`Socket ${status}`" />
        </div>
      </header>

      <p v-if="error" class="error">{{ error }}</p>

      <section class="panel create">
        <h2>Start a new game</h2>
        <div class="row">
          <input
            v-model="newRoomName"
            maxlength="32"
            :placeholder="`${nickname}'s room`"
            @keyup.enter="createRoom"
          />
        </div>
        <PlaqueButton
          title="Create room"
          subtitle="You'll host this table"
          icon="🎉"
          variant="primary"
          chevron
          :disabled="creating"
          @click="createRoom"
        />
      </section>

      <section class="panel">
        <h2>Open rooms</h2>
        <p v-if="!openRooms.length" class="muted">
          Nothing going on yet. Create a room and share the link.
        </p>
        <ul v-else class="rooms">
          <li v-for="room in openRooms" :key="room.id" class="room">
            <div class="room-main">
              <strong>{{ room.name }}</strong>
              <span class="muted small">
                host {{ room.hostNickname }} · {{ since(room.createdAt) }}
              </span>
            </div>
            <span class="badge" :class="room.status">
              {{ room.status === 'playing' ? 'in game' : 'waiting' }}
            </span>
            <span class="count" :class="{ full: room.playerCount >= room.maxPlayers }">
              {{ room.playerCount }}/{{ room.maxPlayers }}
            </span>
            <NuxtLink :to="`/room/${room.id}`">
              <button :disabled="room.playerCount >= room.maxPlayers && room.status === 'lobby'">
                {{ room.status === 'playing' ? 'Watch' : 'Join' }}
              </button>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
/*
 * The landing page gets its own red/maroon "menu" theme instead of the
 * wood-table look the rest of the app uses — scoped entirely to this file
 * so it can't leak into the live game table.
 */
.page {
  position: relative;
  max-width: 820px;
  margin: 0 auto;
  padding: 1.5rem 1rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.page::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(ellipse at 50% 40%, var(--red-1) 0%, var(--red-2) 90%, var(--red-3) 100%),
    url('/common/red-pattern.svg');
  background-repeat: no-repeat, repeat;
  background-size: cover, 340px 340px;
  background-position: center, center;
}

/*
 * These target elements written directly in this page's own template
 * (the "Create room" / "Open rooms" sections and their input), so a plain
 * scoped selector is enough — no `:deep()`, which would otherwise also
 * reach into NicknameGate's internal markup and fight with its own
 * self-contained styling.
 */
.page > section.panel {
  background: linear-gradient(160deg, rgb(122 20 20 / 55%), rgb(61 10 12 / 78%));
  border: 2px solid var(--maroon-edge);
  color: var(--text);
  box-shadow: var(--shadow), inset 0 0 0 1px rgb(255 255 255 / 8%);
}

.page > section.panel h2 {
  color: var(--text);
}

.page > section.panel .muted {
  color: var(--text-dim);
}

.create input {
  color: var(--text);
  background: linear-gradient(180deg, var(--red-3), #2c0708);
  border: 2px solid var(--maroon-edge);
  box-shadow: inset 0 2px 5px rgb(0 0 0 / 45%);
}

.create input::placeholder {
  color: var(--text-dim);
  opacity: 0.7;
}

.rooms button {
  background: linear-gradient(180deg, var(--maroon-1), var(--maroon-2));
}

.header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0 0.25rem;
}

.hero {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.mascot {
  width: 76px;
  height: auto;
  flex: none;
  filter: drop-shadow(0 4px 6px rgb(0 0 0 / 45%));
}

/* Two-tone outlined title, mobile-app menu style. */
.hero-title {
  margin: 0;
  display: flex;
  flex-direction: column;
  line-height: 0.92;
  font-size: clamp(2rem, 7vw, 3.2rem);
  font-weight: 900;
  letter-spacing: -0.01em;
}

.hero-title .line {
  text-shadow:
    -2px -2px 0 var(--outline),
    2px -2px 0 var(--outline),
    -2px 2px 0 var(--outline),
    2px 2px 0 var(--outline),
    0 6px 10px rgb(0 0 0 / 40%);
}

.hero-title .line-gold {
  background: linear-gradient(180deg, #ffe066 0%, var(--accent) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero-title .line-white {
  color: var(--text);
}

.status-row {
  justify-content: flex-end;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-dim);
}

.dot.open {
  background: var(--good);
}

.dot.connecting {
  background: var(--warn);
}

.dot.closed {
  background: var(--bad);
}

.create .row input {
  flex: 1;
}

.small {
  font-size: 0.85rem;
}

.rooms {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.room {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  background: rgb(0 0 0 / 22%);
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: var(--radius);
}

.room-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.room-main strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge {
  font-family: var(--font-display);
  font-size: 0.72rem;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  padding: 0.18rem 0.6rem;
  border-radius: 999px;
  background: rgb(0 0 0 / 28%);
  color: var(--text-dim);
}

.badge.playing {
  background: var(--accent-dim);
  color: #fff;
}

.count {
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
}

.count.full {
  color: var(--bad);
  font-weight: bold;
}

@media (max-width: 560px) {
  .create .row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
