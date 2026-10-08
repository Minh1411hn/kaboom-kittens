<template lang="pug">
aside.spectator-list(:aria-label="$t('table.spectators.title')" :class="`spectator-list--${layout}`")
  h3.spectator-list__heading
    Icon(aria-hidden="true" name="lucide:eye")
    |
    | {{ $t("table.spectators.title") }}
    span.spectator-list__count {{ spectators.length }}

  ul.spectator-list__items
    li.spectator-list__item(
      v-for="spectator in spectators"
      :key="spectator.playerId"
      :class="{ 'spectator-list__item--speaking': spectator.speaking && !spectator.muted }"
      :title="spectator.nickname"
    )
      PlayerAvatar.spectator-list__avatar(:avatar-id="spectator.avatarId" :size="40")
        template(v-if="spectator.micOn !== null" #corner)
          VoiceBadge(
            :interactive="spectator.playerId !== youId"
            :mic-on="spectator.micOn"
            :muted="spectator.muted"
            :speaking="spectator.speaking"
            @toggle="emit('toggleVoiceMute', spectator.playerId)"
          )
      span.spectator-list__name
        | {{ spectator.nickname }}
        span.spectator-list__you(v-if="spectator.playerId === youId") {{ $t("table.spectators.you") }}
</template>

<script setup lang="ts">
  import type { Spectator } from "#shared/protocol/messages"

  /**
   * Everyone in the room without a seat — latecomers waiting for the next game
   * and a full room's overflow. They can still talk, so each one carries the
   * same voice chip as a seat; without the list, players hear voices they
   * cannot place.
   *
   * `rail` is the narrow column pinned to the left edge during a game; `inline`
   * sits in the waiting room's flow under the player list.
   */
  withDefaults(
    defineProps<{
      spectators: Array<
        Spectator & {
          /** null: not in the voice call. */
          micOn: boolean | null
          muted: boolean
          speaking: boolean
        }
      >
      youId: string | null
      layout?: "rail" | "inline"
    }>(),
    { layout: "rail" }
  )

  const emit = defineEmits<{ toggleVoiceMute: [playerId: string] }>()
</script>

<style scoped lang="scss">
  .spectator-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    &__heading {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin: 0;
      font-family: var(--font-display);
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: $ink-dim;
    }

    &__count {
      min-width: 1.4em;
      padding: 0 0.35em;
      border-radius: 999px;
      background: $ink;
      color: $cream;
      font-size: 0.75rem;
      text-align: center;
    }

    &__items {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    &__item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
      padding: 0.2rem 0.45rem 0.2rem 0.2rem;
      border-radius: 999px;
      transition: background-color 0.15s ease;

      &--speaking {
        background: rgb(255 194 26 / 28%);
      }
    }

    &__name {
      min-width: 0;
      overflow: hidden;
      font-weight: 700;
      font-size: 0.9rem;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &__you {
      margin-left: 0.25rem;
      font-weight: 400;
      color: $ink-dim;
    }

    // Pinned to the left edge of the viewport while a game is on. Phones get
    // a horizontal strip in the page flow instead, since there is no spare edge.
    &--rail {
      @include card;
      padding: 0.6rem;

      .spectator-list__items {
        flex-direction: row;
        flex-wrap: wrap;
      }

      @include respond-to("lg") {
        position: fixed;
        top: 50%;
        left: 0.75rem;
        z-index: 9;
        width: 168px;
        max-height: 70vh;
        overflow-y: auto;
        transform: translateY(-50%);

        .spectator-list__items {
          flex-direction: column;
        }
      }
    }
  }
</style>
