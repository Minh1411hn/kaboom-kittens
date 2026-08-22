<template lang="pug">
.home
  NicknameGate(v-if="ready && !nickname" @done="onNicknameSet")

  template(v-else-if="ready")
    CommonHeader.home__header(
      :avatar-id="avatarId"
      :nickname="nickname"
      :status="status"
      @profile-click="profileDialogOpen = true"
    )
      template(#actions)
        LocaleSwitcher
        CommonButton(
          :aria-label="$t('table.topbar.audio_settings')"
          icon="lucide:volume-2"
          variant="gold"
          @click="audioDialogOpen = true"
        )
        CommonButton(
          :aria-label="$t('app.your_profile')"
          icon="lucide:settings"
          variant="gold"
          @click="profileDialogOpen = true"
        )

    .home__inner
      //- Left column: the brand and the one primary action.
      section.home__brand
        img.home__logo(alt="BLOW U.P." src="/branding/logo-banner.png")
        img.home__mascot(alt="" src="/branding/mascot.png")

        CommonButton.home__create(
          :disabled="creating"
          :label="$t('app.create_room')"
          :loading="creating"
          icon="lucide:users"
          size="lg"
          variant="gold"
          @click="createRoom"
        )

        p.home__error.error(v-if="error") {{ error }}

      //- Right column: who you are, then the live room list.
      section.home__lobby
        h2.home__heading {{ $t('app.room_list_heading') }}

        p.home__empty(v-if="!openRooms.length")
          | {{ $t('app.no_rooms') }}

        ul.home__rooms(v-else)
          li.home__room(v-for="room in openRooms" :key="room.id")
            .home__room-main
              strong.home__room-name {{ room.name }}
              span.home__room-meta
                | - {{ $t('app.room_player_count', { count: room.playerCount, max: room.maxPlayers }) }} ·
                | {{ room.status === "playing" ? $t('app.status_playing') : $t('app.status_waiting') }} ·
                | {{ since(room.createdAt) }}
            CommonButton.home__room-join(
              :disabled="room.playerCount >= room.maxPlayers && room.status === 'lobby'"
              :label="room.status === 'playing' ? $t('app.room_view') : $t('app.room_enter')"
              size="sm"
              variant="red"
              @click="navigateTo(`/room/${room.id}`)"
            )

    ProfileDialog(
      v-if="profileDialogOpen"
      :avatar-id="avatarId"
      :nickname="nickname"
      :saving="savingProfile"
      @cancel="profileDialogOpen = false"
      @save="onProfileSave"
    )

    AudioSettingsDialog(v-if="audioDialogOpen" @cancel="audioDialogOpen = false")
</template>

<script setup lang="ts">
  import type { RoomSummary } from "#shared/protocol/messages"

  const { nickname, avatarId, ready, load, setProfile } = useSession()
  const { rooms, connect, send, status, error, resetRoom } = useGameSocket()
  const { t } = useI18n()

  const creating = ref(false)
  const profileDialogOpen = ref(false)
  const audioDialogOpen = ref(false)
  const savingProfile = ref(false)

  await load()

  // Paint the list server-side; the socket keeps it live from then on.
  const { data: initialRooms } = await useFetch<{ rooms: RoomSummary[] }>("/api/rooms")
  if (initialRooms.value?.rooms) rooms.value = initialRooms.value.rooms

  onMounted(() => {
    resetRoom()
    if (nickname.value) start()
  })

  function start() {
    connect()
    // The socket may still be opening; useGameSocket buffers until it is not.
    send({ type: "watch-lobby" })
  }

  function onNicknameSet() {
    start()
  }

  async function onProfileSave(nicknameValue: string, avatarIdValue: string) {
    if (savingProfile.value) return
    savingProfile.value = true
    try {
      // REST first: the durable write, works even if the socket is down.
      await setProfile(nicknameValue, avatarIdValue)
      // Then tell the live room (if any) to refresh for everyone else.
      send({ type: "update-profile", nickname: nicknameValue, avatarId: avatarIdValue })
      profileDialogOpen.value = false
    } finally {
      savingProfile.value = false
    }
  }

  async function createRoom() {
    if (creating.value) return
    creating.value = true
    try {
      const { roomId } = await $fetch<{ roomId: string }>("/api/rooms", {
        method: "POST",
        body: {}
      })
      await navigateTo(`/room/${roomId}`)
    } catch (caught) {
      const code = (caught as { data?: { data?: { code?: string } } }).data?.data?.code
      error.value = code ? t(`errors.${code}`) : t("errors.room-create-failed")
    } finally {
      creating.value = false
    }
  }

  const openRooms = computed(() => rooms.value.filter((room) => room.status !== "over"))

  function since(at: number): string {
    const minutes = Math.round((Date.now() - at) / 60000)
    if (minutes < 1) return t("app.time_just_now")
    if (minutes < 60) return t("app.time_minutes_ago", { minutes })
    return t("app.time_hours_ago", { hours: Math.round(minutes / 60) })
  }
</script>

<style scoped lang="scss">
  /*
   * Two columns on wide screens — brand on the left, room list on the right —
   * stacking to one below `md`. The page paints no background of its own; the
   * cream comes from `layouts/default.vue`.
   */
  .home {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-height: 100dvh;
    padding: 1.5rem 1rem 3rem;

    &__header {
      flex: none;

      /*
       * Wide enough to spare the room: lift the bar out of the flow so it stops
       * eating into the height `__inner` centres against, and the brand and the
       * room list sit in the middle of the viewport rather than in the middle of
       * what is left under it. Below `lg` the stacked columns are taller than the
       * viewport anyway, so a floating bar would just cover the logo — there it
       * stays in the flow.
       */
      @include respond-to("lg") {
        position: absolute;
        inset: 1.5rem 1rem auto;
        z-index: 1;
      }
    }

    &__inner {
      display: flex;
      flex-direction: column;
      gap: 2rem;
      width: 100%;
      max-width: 1280px;
      /*
       * `auto` on all four sides centres the block in both axes. Deliberately
       * not `align-items: center` on the parent: when the content outgrows the
       * viewport that overflows past the top edge and cannot be scrolled back
       * to, while auto margins collapse to zero instead.
       */
      margin: auto;

      @include respond-to("lg") {
        flex-direction: row;
        align-items: center;
        gap: 3rem;
      }
    }

    &__brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.25rem;
      flex: 1;
    }

    // Placeholder until the real `BLOW U.P.` artwork lands.
    // A transparent PNG wordmark, so it sits straight on the cream field.
    &__logo {
      display: block;
      width: 100%;
      max-width: 520px;
      height: auto;
    }

    &__mascot {
      display: block;
      width: 100%;
      max-width: 300px;
      height: auto;
    }

    &__create {
      width: 100%;
      max-width: 480px;
    }

    &__error {
      text-align: center;
    }

    &__lobby {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      flex: 1;
      min-width: 0;
    }

    &__empty {
      color: $ink-dim;
      text-align: center;
    }

    &__heading {
      margin: 0;
      text-align: center;
      font-size: clamp(1.6rem, 3vw, 2.2rem);
    }

    &__rooms {
      list-style: none;
      margin: 0;
      padding: 0 0.5rem 0.5rem 0;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-height: 70vh;
      overflow-y: auto;
      scrollbar-color: $ink transparent;
      scrollbar-width: thin;
    }

    &__room {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.9rem 1.1rem;
      background: $cream-card;
      border: $outline-width solid $ink;
      border-radius: $radius;
      box-shadow: 0 4px 0 $ink;
    }

    &__room-main {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      flex: 1;
      min-width: 0;
    }

    &__room-name {
      font-family: $font-display;
      font-size: 1.15rem;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: $ink;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__room-meta {
      font-size: 0.9rem;
      color: $ink-dim;
    }

    &__room-join {
      flex: none;
    }
  }
</style>
