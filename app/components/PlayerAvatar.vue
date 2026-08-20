<template lang="pug">
span.player-avatar(:style="{ width: `${size}px`, height: `${size}px`, '--avatar-size': `${size}px` }")
  span.player-avatar__circle(
    :class="{ 'player-avatar__circle--current': current, 'player-avatar__circle--selected': selected, 'player-avatar__circle--targetable': targetable, 'player-avatar__circle--offline': offline }"
  )
    img.player-avatar__img.avatar-img(:src="src" alt="" draggable="false")

  span.player-avatar__nameplate(
    v-if="name"
    :class="{ 'player-avatar__nameplate--dim': !alive, 'player-avatar__nameplate--current': current }"
  )
    | {{ name }}
    slot(name="nameSuffix")

  span.player-avatar__host-tag(v-if="host") Host

  span.player-avatar__corner(v-if="$slots.corner")
    slot(name="corner")
</template>

<script setup lang="ts">
  /**
   * Shared avatar rendering for a player: a circular portrait with the
   * nickname overlaid near the top of the circle (a nameplate sitting inside
   * the avatar, not beside or above it), plus the status rings (turn, target
   * selection, targetability, offline) every seat-like display needs.
   *
   * No per-seat identity color here on purpose — that colored ring was
   * removed; only status rings remain. `name` is optional: leave it unset to
   * render just the circle (e.g. the compact header/topbar user pill, which
   * keeps its own nickname text beside the avatar).
   *
   * The `corner` slot hangs a badge off the bottom-right (the voice chip). It is
   * a sibling of `.avatar`, not a child, because `.avatar` clips to the circle.
   */
  const props = withDefaults(
    defineProps<{
      avatarId: string | null | undefined
      alive?: boolean
      name?: string | null
      /** Shows a "Host" tag inside the bottom of the circle, mirroring `name`. */
      host?: boolean
      size?: number
      current?: boolean
      selected?: boolean
      targetable?: boolean
      offline?: boolean
    }>(),
    {
      alive: true,
      name: null,
      host: false,
      size: 62,
      current: false,
      selected: false,
      targetable: false,
      offline: false
    }
  )

  const src = computed(() => (props.alive ? avatarUrl(props.avatarId) : deathAvatarUrl()))
</script>

<style scoped lang="scss">
  .player-avatar {
    position: relative;
    display: inline-grid;
    flex-shrink: 0;
    place-items: center;

    &__circle {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      border-radius: 50%;
      overflow: hidden;
      background: $cream;
      box-shadow:
        inset 0 0 10px rgb(0 0 0 / 35%),
        inset 0 2px 5px rgb(0 0 0 / 20%);

      &--current {
        animation: turn-glow 1.6s ease-in-out infinite;
      }

      &--selected {
        box-shadow:
          inset 0 0 10px rgb(0 0 0 / 35%),
          inset 0 2px 5px rgb(0 0 0 / 20%),
          0 0 0 5px var(--bad),
          0 0 20px rgb(232 53 46 / 60%);
      }

      &--targetable {
        cursor: pointer;
        animation: pulse 1.4s ease-in-out infinite;
      }

      &--offline {
        filter: grayscale(0.6);
      }
    }

    &__img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }

    &__nameplate {
      position: absolute;
      top: -8%;
      left: 50%;
      z-index: 1;
      width: 86%;
      transform: translateX(-50%);
      pointer-events: none;
      font-family: var(--font-display);
      font-size: calc(var(--avatar-size) * 0.24);
      font-weight: 700;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      text-align: center;
      color: $ink;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      &--dim {
        color: var(--text-dim);
      }

      &--current {
        color: $accent-dim;
      }
    }

    &__host-tag {
      position: absolute;
      bottom: -8%;
      left: 50%;
      z-index: 1;
      width: 86%;
      transform: translateX(-50%);
      pointer-events: none;
      font-family: var(--font-display);
      font-size: calc(var(--avatar-size) * 0.2);
      font-weight: 700;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      text-align: center;
      color: var(--warn);
      text-shadow:
        -1px -1px 0 var(--outline),
        1px -1px 0 var(--outline),
        -1px 1px 0 var(--outline),
        1px 1px 0 var(--outline),
        0 2px 3px rgb(0 0 0 / 45%);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &__corner {
      position: absolute;
      right: -2%;
      bottom: -2%;
      z-index: 2;
      display: grid;
      place-items: center;
      line-height: 0;
    }
  }

  /* Whose turn it is: a lit ring plus a breathing glow around the avatar. */
  @keyframes turn-glow {
    0%,
    100% {
      box-shadow:
        inset 0 0 10px rgb(0 0 0 / 35%),
        inset 0 2px 5px rgb(0 0 0 / 20%),
        0 0 0 4px var(--warn),
        0 0 18px rgb(255 194 26 / 55%);
    }
    50% {
      box-shadow:
        inset 0 0 10px rgb(0 0 0 / 35%),
        inset 0 2px 5px rgb(0 0 0 / 20%),
        0 0 0 4px var(--warn),
        0 0 34px 6px rgb(255 194 26 / 85%);
    }
  }

  @keyframes pulse {
    50% {
      box-shadow:
        inset 0 0 10px rgb(0 0 0 / 35%),
        inset 0 2px 5px rgb(0 0 0 / 20%),
        0 0 0 5px rgb(255 194 26 / 55%),
        0 0 16px rgb(255 194 26 / 40%);
    }
  }
</style>
