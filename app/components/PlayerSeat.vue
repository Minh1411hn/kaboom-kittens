<script setup lang="ts">
import type { PublicPlayer } from "#shared/types/game";

const props = withDefaults(
    defineProps<{
        player: PublicPlayer;
        isCurrent: boolean;
        isHost: boolean;
        isYou: boolean;
        turnsRemaining: number;
        /** Highlighted as a legal target while the player is picking one. */
        targetable?: boolean;
        selected?: boolean;
        layout?: "horizontal" | "vertical";
        /** `null` when this player is not in the voice call — no badge shown. */
        voiceMicOn?: boolean | null;
        voiceSpeaking?: boolean;
        voiceMuted?: boolean;
        /** Only other players' badges are clickable; yours is a read-out. */
        voiceInteractive?: boolean;
    }>(),
    {
        layout: "vertical",
        voiceMicOn: null,
        voiceSpeaking: false,
        voiceMuted: false,
        voiceInteractive: false,
    },
);

const emit = defineEmits<{ pick: [id: string]; toggleVoiceMute: [id: string] }>();

/**
 * The seat is a div, not a button: it carries the voice badge, which is itself
 * a button, and a button inside a button is invalid markup that browsers
 * flatten unpredictably. `role`/`tabindex`/keyboard handling keep the
 * pick-a-target affordance intact.
 */
function pick() {
    if (props.targetable) emit("pick", props.player.id);
}

/**
 * Past this many the fan stops growing and an overflow chip takes over. An
 * opening hand is 8 cards, so a fresh table shows no chip at all.
 */
const FAN_MAX = 8;
const fanned = computed(() => Math.min(props.player.handCount, FAN_MAX));
const overflow = computed(() => Math.max(0, props.player.handCount - FAN_MAX));

/** Same trick as HandFan: rotate around the middle so the cards splay out. */
function fanStyle(oneBasedIndex: number) {
    const offset = oneBasedIndex - 1 - (fanned.value - 1) / 2;
    return {
        transform: `rotate(${offset * 11}deg) translateY(${Math.abs(offset) * 1.4}px)`,
        marginLeft: oneBasedIndex === 1 ? "0" : "-9px",
    };
}

const back = cardBackUrl();
</script>

<template>
    <div
        class="seat"
        :class="{
            current: isCurrent,
            dead: !player.alive,
            you: isYou,
            targetable,
            selected,
            offline: !player.connected,
            horizontal: layout === 'horizontal',
        }"
        role="button"
        :aria-disabled="!targetable"
        :tabindex="targetable ? 0 : -1"
        @click="pick"
        @keydown.enter.prevent="pick"
        @keydown.space.prevent="pick"
    >
        <PlayerAvatar
            class="seat-avatar"
            :avatar-id="player.avatarId"
            :alive="player.alive"
            :name="player.nickname"
            :host="isHost && layout === 'horizontal'"
            :current="isCurrent"
            :selected="selected"
            :targetable="targetable"
            :offline="!player.connected"
        >
            <template #nameSuffix>
                <span v-if="!player.connected"> (Mất kết nối)</span>
                <!-- <span v-if="isYou" class="you-tag"> (bạn)</span> -->
            </template>

            <template v-if="voiceMicOn !== null" #corner>
                <VoiceBadge
                    :mic-on="voiceMicOn"
                    :speaking="voiceSpeaking"
                    :muted="voiceMuted"
                    :interactive="voiceInteractive"
                    @toggle="emit('toggleVoiceMute', player.id)"
                />
            </template>
        </PlayerAvatar>

        <span
            v-if="player.ready"
            class="ready-badge"
            title="Đã sẵn sàng cho ván mới"
        >
            <Icon name="lucide:circle-check" aria-hidden="true" /> Sẵn sàng
        </span>

        <span
            v-if="player.alive && player.handCount"
            class="fan"
            aria-hidden="true"
        >
            <img
                v-for="i in fanned"
                :key="i"
                class="mini"
                :src="back"
                alt=""
                :style="fanStyle(i)"
                draggable="false"
            />
            <span v-if="overflow" class="more">+{{ overflow }}</span>
        </span>

        <span v-if="layout !== 'horizontal'" class="meta">
            {{ player.handCount }} lá bài
            <template v-if="isCurrent && turnsRemaining > 1">
                · còn {{ turnsRemaining }} lượt</template
            >
        </span>
    </div>
</template>

<style scoped>
.seat {
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
}

.seat[aria-disabled="true"] {
    opacity: 1;
    cursor: default;
}

.seat:hover:not([aria-disabled="true"]) {
    filter: none;
}

.seat:active:not([aria-disabled="true"]) {
    transform: none;
}

.fan {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    height: 26px;
    margin-top: -0.1rem;
}

.mini {
    width: 18px;
    aspect-ratio: var(--card-ratio);
    border-radius: 3px;
    object-fit: cover;
    box-shadow: 0 1px 2px rgb(0 0 0 / 45%);
    transform-origin: 50% 120%;
}

/* Sits over the red minis, so it needs its own ground to stay readable. */
.more {
    align-self: flex-end;
    margin: 0 0 0.1rem 0.35rem;
    padding: 0.05rem 0.32rem;
    border-radius: 999px;
    background: rgb(40 18 2 / 80%);
    font-family: var(--font-display);
    font-size: 0.72rem;
    line-height: 1.35;
    color: var(--text);
}

.meta {
    font-size: 0.7rem;
    letter-spacing: 0.3px;
    color: var(--text-dim);
    text-shadow: 0 1px 2px rgb(30 12 0 / 60%);
}

.ready-badge {
    font-size: 0.68rem;
    letter-spacing: 0.3px;
    color: var(--good);
    text-shadow: 0 1px 2px rgb(30 12 0 / 60%);
}

.you-tag {
    color: var(--text-dim);
    font-weight: normal;
}

.seat.dead {
    opacity: 0.55;
}

.seat.dead .meta {
    color: var(--text-dim);
}

.seat.targetable {
    cursor: pointer;
}

.seat.horizontal {
    flex-direction: row;
    justify-content: space-between;
    text-align: left;
    flex: 1;
    min-width: 0;
    padding: 0.5rem 1rem;
    gap: 1rem;
}
</style>
