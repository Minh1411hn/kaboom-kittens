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
        avatarId: string | null | undefined;
        alive?: boolean;
        name?: string | null;
        /** Shows a "Host" tag inside the bottom of the circle, mirroring `name`. */
        host?: boolean;
        size?: number;
        current?: boolean;
        selected?: boolean;
        targetable?: boolean;
        offline?: boolean;
    }>(),
    {
        alive: true,
        name: null,
        host: false,
        size: 62,
        current: false,
        selected: false,
        targetable: false,
        offline: false,
    },
);

const src = computed(() =>
    props.alive ? avatarUrl(props.avatarId) : deathAvatarUrl(),
);
</script>

<template>
    <span
        class="avatar-frame"
        :style="{
            width: `${size}px`,
            height: `${size}px`,
            '--avatar-size': `${size}px`,
        }"
    >
        <span
            class="avatar"
            :class="{ current, selected, targetable, offline }"
        >
            <img class="avatar-img" :src="src" alt="" draggable="false" />
        </span>

        <span v-if="name" class="nameplate" :class="{ dim: !alive, current }">
            {{ name }}<slot name="nameSuffix" />
        </span>

        <span v-if="host" class="host-tag">Host</span>

        <span v-if="$slots.corner" class="corner">
            <slot name="corner" />
        </span>
    </span>
</template>

<style scoped>
.avatar-frame {
    position: relative;
    display: inline-grid;
    flex-shrink: 0;
    place-items: center;
}

.avatar {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    overflow: hidden;
    background: rgb(0 0 0 / 25%);
    box-shadow:
        inset 0 0 10px rgb(0 0 0 / 35%),
        inset 0 2px 5px rgb(0 0 0 / 20%);
}

.avatar-img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
}

/* Whose turn it is: a lit ring plus a breathing glow around the avatar. */
.avatar.current {
    animation: turn-glow 1.6s ease-in-out infinite;
}

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

.avatar.selected {
    box-shadow:
        inset 0 0 10px rgb(0 0 0 / 35%),
        inset 0 2px 5px rgb(0 0 0 / 20%),
        0 0 0 5px var(--bad),
        0 0 20px rgb(232 53 46 / 60%);
}

.avatar.targetable {
    cursor: pointer;
    animation: pulse 1.4s ease-in-out infinite;
}

.avatar.offline {
    filter: grayscale(0.6);
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

/* Sits inside the circle, over the top of the portrait — not above it. */
.nameplate {
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
    color: var(--text);
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

.nameplate.dim {
    color: var(--text-dim);
}

.nameplate.current {
    color: #fff;
}

/* Badge slot: overhangs the circle's bottom-right, outside the clip. */
.corner {
    position: absolute;
    right: -2%;
    bottom: -2%;
    z-index: 2;
    display: grid;
    place-items: center;
    line-height: 0;
}

/* Mirrors .nameplate, but sits inside the bottom of the circle. */
.host-tag {
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
</style>
