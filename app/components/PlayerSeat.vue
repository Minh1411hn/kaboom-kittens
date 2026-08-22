<template lang="pug">
.player-seat.seat(
  :aria-disabled="!targetable"
  :class="{ 'player-seat--current current': isCurrent, 'player-seat--dead dead': !player.alive, 'player-seat--you you': isYou, 'player-seat--targetable targetable': targetable, 'player-seat--selected selected': selected, 'player-seat--offline offline': !player.connected, 'player-seat--horizontal horizontal': layout === 'horizontal' }"
  :tabindex="targetable ? 0 : -1"
  role="button"
  @click="pick"
  @keydown.enter.prevent="pick"
  @keydown.space.prevent="pick"
)
  PlayerAvatar.player-seat__avatar(
    :alive="player.alive"
    :avatar-id="player.avatarId"
    :current="isCurrent"
    :host="isHost && layout === 'horizontal'"
    :name="player.nickname"
    :offline="!player.connected"
    :selected="selected"
    :targetable="targetable"
  )
    template(#nameSuffix)
      span.player-seat__disconnected(v-if="!player.connected") {{ $t('table.player_seat.disconnected') }}

    template(v-if="voiceMicOn !== null" #corner)
      VoiceBadge(
        :interactive="voiceInteractive"
        :mic-on="voiceMicOn"
        :muted="voiceMuted"
        :speaking="voiceSpeaking"
        @toggle="emit('toggleVoiceMute', player.id)"
      )

  span.player-seat__ready-badge.ready-badge(v-if="player.ready" :title="$t('table.player_seat.ready_title')")
    Icon(aria-hidden="true" name="lucide:circle-check")
    |
    | {{ $t('table.player_seat.ready') }}

  span.player-seat__fan.fan(v-if="player.alive && player.handCount" aria-hidden="true")
    img.player-seat__mini.mini(v-for="i in fanned" :key="i" :src="back" :style="fanStyle(i)" alt="" draggable="false")
    span.player-seat__more.more(v-if="overflow") +{{ overflow }}

  span.player-seat__meta.meta(v-if="layout !== 'horizontal'")
    | {{ $t('table.player_seat.hand_count', { count: player.handCount }) }}
    template(v-if="isCurrent && turnsRemaining > 1")
      |
      | {{ $t('table.player_seat.turns_left', { count: turnsRemaining }) }}
</template>

<script setup lang="ts">
  import type { PublicPlayer } from "#shared/types/game"

  const props = withDefaults(
    defineProps<{
      player: PublicPlayer
      isCurrent: boolean
      isHost: boolean
      isYou: boolean
      turnsRemaining: number
      /** Highlighted as a legal target while the player is picking one. */
      targetable?: boolean
      selected?: boolean
      layout?: "horizontal" | "vertical"
      /** `null` when this player is not in the voice call — no badge shown. */
      voiceMicOn?: boolean | null
      voiceSpeaking?: boolean
      voiceMuted?: boolean
      /** Only other players' badges are clickable; yours is a read-out. */
      voiceInteractive?: boolean
    }>(),
    {
      layout: "vertical",
      voiceMicOn: null,
      voiceSpeaking: false,
      voiceMuted: false,
      voiceInteractive: false
    }
  )

  const emit = defineEmits<{ pick: [id: string]; toggleVoiceMute: [id: string] }>()

  /**
   * The seat is a div, not a button: it carries the voice badge, which is itself
   * a button, and a button inside a button is invalid markup that browsers
   * flatten unpredictably. `role`/`tabindex`/keyboard handling keep the
   * pick-a-target affordance intact.
   */
  function pick() {
    if (props.targetable) emit("pick", props.player.id)
  }

  /**
   * Past this many the fan stops growing and an overflow chip takes over. An
   * opening hand is 8 cards, so a fresh table shows no chip at all.
   */
  const FAN_MAX = 8
  const fanned = computed(() => Math.min(props.player.handCount, FAN_MAX))
  const overflow = computed(() => Math.max(0, props.player.handCount - FAN_MAX))

  /** Same trick as HandFan: rotate around the middle so the cards splay out. */
  function fanStyle(oneBasedIndex: number) {
    const offset = oneBasedIndex - 1 - (fanned.value - 1) / 2
    return {
      transform: `rotate(${offset * 11}deg) translateY(${Math.abs(offset) * 1.4}px)`,
      marginLeft: oneBasedIndex === 1 ? "0" : "-9px"
    }
  }

  const back = cardBackUrl()
</script>

<style scoped lang="scss">
  .player-seat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.35rem;
    min-width: 104px;
    background: none;
    border: none;
    box-shadow: none;
    border-radius: 14px;
    cursor: default;
    /* Explicit now that the root is a div: the global `button` rule used to
       supply this, and inheriting it silently would be a trap for later. */
    color: var(--text);
    text-transform: none;
    font-family: var(--font-body);
    font-size: 1rem;
    letter-spacing: normal;

    &[aria-disabled="true"] {
      opacity: 1;
      cursor: default;
    }

    &:hover:not([aria-disabled="true"]) {
      filter: none;
    }

    &:active:not([aria-disabled="true"]) {
      transform: none;
    }

    &--current {
      // current turn modifier
    }

    &--dead {
      opacity: 0.55;

      .player-seat__meta {
        color: var(--text-dim);
      }
    }

    &--you {
      // you modifier
    }

    &--targetable {
      cursor: pointer;
    }

    &--selected {
      // selected modifier
    }

    &--offline {
      // offline modifier
    }

    &--horizontal {
      flex-direction: row;
      justify-content: space-between;
      text-align: left;
      flex: 1;
      min-width: 0;
      padding: 0.5rem 1rem;
      gap: 1rem;
    }

    &__avatar {
      // avatar element
    }

    &__disconnected {
      // disconnected text
    }

    &__ready-badge {
      font-size: 0.68rem;
      letter-spacing: 0.3px;
      color: var(--good);
      text-shadow: 0 1px 2px rgb(30 12 0 / 60%);
    }

    &__fan {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      height: 26px;
      margin-top: -0.1rem;
    }

    &__mini {
      width: 18px;
      aspect-ratio: var(--card-ratio);
      border-radius: 3px;
      object-fit: cover;
      box-shadow: 0 1px 2px rgb(0 0 0 / 45%);
      transform-origin: 50% 120%;
    }

    /* Sits over the red minis, so it needs its own ground to stay readable. */
    &__more {
      align-self: flex-end;
      margin: 0 0 0.1rem 0.35rem;
      padding: 0.05rem 0.32rem;
      border-radius: 999px;
      background: $cream-card;
      border: 1px solid $ink;
      font-family: var(--font-display);
      font-size: 0.72rem;
      line-height: 1.35;
      color: $ink;
    }

    &__meta {
      font-size: 0.7rem;
      letter-spacing: 0.3px;
      color: $ink-dim;
    }
  }
</style>
