<script setup lang="ts">
import type { PendingAction, PublicPlayer } from "#shared/types/game";

const props = defineProps<{
    stack: PendingAction[];
    deadline: number;
    players: PublicPlayer[];
    hasNope: boolean;
    /** You cannot Nope the card sitting on top if you are the one who played it. */
    youPlayedTop: boolean;
    passed: boolean;
}>();

defineEmits<{ nope: []; pass: [] }>();

const { remaining, fraction } = useCountdown(() => props.deadline);

const playerById = (id: string | null | undefined): PublicPlayer | undefined =>
    props.players.find((p) => p.id === id);

const baseAction = computed<PendingAction | undefined>(() => props.stack[0]);
const caster = computed(() =>
    baseAction.value ? playerById(baseAction.value.playerId) : undefined,
);
const target = computed(() =>
    baseAction.value?.targetPlayerId
        ? playerById(baseAction.value.targetPlayerId)
        : undefined,
);

const nopesCount = computed(() => Math.max(0, props.stack.length - 1));
const isBlocked = computed(() => nopesCount.value % 2 === 1);

const lastNoper = computed(() => {
    if (props.stack.length <= 1) return undefined;
    const top = props.stack[props.stack.length - 1];
    return top ? playerById(top.playerId) : undefined;
});

const actionTitle = computed(() => {
    const base = baseAction.value;
    if (!base) return "";
    if (base.combo === "pair") return "Combo 2 lá mèo";
    if (base.combo === "triple") {
        const demanded = base.namedCardId
            ? ` (${cardName(base.namedCardId)})`
            : "";
        return `Combo 3 lá mèo${demanded}`;
    }
    if (base.combo === "five-different") return "Combo 5 lá mèo";
    return cardName(base.cardId);
});

const verdictText = computed(() => {
    if (nopesCount.value === 0) return "";
    if (isBlocked.value) {
        const noperName = lastNoper.value?.nickname ?? "NOPE";
        return `Bị chặn bởi ${noperName} (${nopesCount.value} Nope)`;
    }
    return `Đang có hiệu lực (${nopesCount.value} Nope triệt tiêu)`;
});
</script>

<template>
    <div class="nope-bar" role="status">
        <div class="fill" :style="{ transform: `scaleX(${fraction})` }" />

        <div class="content">
            <!-- 1. The Stack of Cards with z-index ordering and PlayerAvatar on Nope cards -->
            <div class="stack" aria-label="Chuỗi bài đang xử lý">
                <div
                    v-for="(action, i) in stack"
                    :key="action.id + i"
                    class="stack-card-item"
                    :class="{
                        'is-nope': action.cardId === 'nope' || i > 0,
                        'is-base': i === 0,
                    }"
                    :style="{
                        zIndex: i + 1,
                    }"
                >
                    <CardImage :card-id="action.cardId" width="54px" />

                    <!-- Mini avatar of the player who played this Nope card at the bottom-right corner -->
                    <div
                        v-if="action.cardId === 'nope' || i > 0"
                        class="card-avatar-badge"
                        :title="`Nope bởi ${playerById(action.playerId)?.nickname ?? 'Người chơi'}`"
                    >
                        <PlayerAvatar
                            :avatar-id="playerById(action.playerId)?.avatarId"
                            :alive="playerById(action.playerId)?.alive"
                            :size="22"
                        />
                    </div>
                </div>
            </div>

            <!-- 2. Action Information: Caster [Avatar] ➔ Target [Avatar] -->
            <div class="action-info">
                <div class="players-flow">
                    <!-- Caster -->
                    <div
                        class="player-pill caster"
                        :title="`Người đánh: ${caster?.nickname ?? ''}`"
                    >
                        <PlayerAvatar
                            :avatar-id="caster?.avatarId"
                            :alive="caster?.alive"
                            :size="26"
                        />
                        <span class="pill-name">{{
                            caster?.nickname ?? "Ai đó"
                        }}</span>
                    </div>

                    <!-- Target (if exists) -->
                    <template v-if="target">
                        <span class="target-arrow" aria-hidden="true">
                            <Icon name="lucide:arrow-right" />
                        </span>
                        <div
                            class="player-pill target"
                            :title="`Mục tiêu: ${target.nickname}`"
                        >
                            <PlayerAvatar
                                :avatar-id="target.avatarId"
                                :alive="target.alive"
                                :size="26"
                            />
                            <span class="pill-name">{{ target.nickname }}</span>
                        </div>
                    </template>
                </div>

                <div class="action-details">
                    <div class="action-title-row">
                        <span class="action-prefix">đã dùng</span>
                        <strong class="action-name">{{ actionTitle }}</strong>
                    </div>

                    <div class="status-row">
                        <span
                            v-if="nopesCount > 0"
                            class="verdict-tag"
                            :class="{ blocked: isBlocked, active: !isBlocked }"
                        >
                            <span class="status-dot" />
                            {{ verdictText }}
                        </span>
                        <span class="muted countdown-text"
                            >{{ remaining }}s để phản hồi</span
                        >
                    </div>
                </div>
            </div>

            <!-- 3. Interaction Actions -->
            <div class="actions">
                <button
                    v-if="hasNope && !youPlayedTop"
                    class="danger nope-btn"
                    @click="$emit('nope')"
                >
                    NOPE!
                </button>
                <button
                    v-if="hasNope && !youPlayedTop"
                    class="pass-btn"
                    :disabled="passed"
                    @click="$emit('pass')"
                >
                    {{ passed ? "Đã bỏ qua" : "Bỏ qua" }}
                </button>
                <span v-else class="muted small waiting-label">Đang chờ…</span>
            </div>
        </div>
    </div>
</template>

<style scoped>
.nope-bar {
    position: relative;
    overflow: hidden;
    background: linear-gradient(
        180deg,
        #f8ecd2,
        var(--parchment) 45%,
        var(--parchment-2)
    );
    border-radius: 16px;
    box-shadow:
        0 0 0 4px rgb(232 53 46 / 55%),
        0 18px 40px rgb(20 8 0 / 60%);
    color: var(--ink);
}

/* Drains left to right as the window closes. */
.fill {
    position: absolute;
    inset: 0;
    transform-origin: left;
    background: linear-gradient(
        90deg,
        rgb(232 53 46 / 26%),
        rgb(245 119 28 / 10%)
    );
    transition: transform 0.25s linear;
}

.content {
    position: relative;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.1rem;
    flex-wrap: wrap;
}

/* 1. Stack cards styling */
.stack {
    display: flex;
    align-items: center;
    flex-shrink: 0;
}

.stack-card-item {
    position: relative;
    transition: transform 0.15s ease;
}

.stack-card-item:hover {
    transform: scale(1.35) translateY(-8px);
    z-index: 50 !important;
}

.card-avatar-badge {
    position: absolute;
    bottom: -12px;
    right: -4px;
    z-index: 2;
    pointer-events: none;
    border-radius: 50%;
    /* box-shadow: 0 2px 6px rgb(0 0 0 / 55%); */
}

/* 2. Action info & Player flow */
.action-info {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
    min-width: 220px;
    padding: 0 20px;
}

.players-flow {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
}

.player-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 2px 8px 2px 2px;
    background: rgb(0 0 0 / 8%);
    border: 1px solid rgb(0 0 0 / 12%);
    border-radius: 999px;
}

.player-pill.target {
    background: rgb(232 53 46 / 10%);
    border-color: rgb(232 53 46 / 25%);
}

.pill-name {
    font-family: var(--font-display);
    font-size: 0.92rem;
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
}

.target-arrow {
    color: var(--bad);
    font-weight: 800;
    font-size: 0.95rem;
    line-height: 1;
}

.action-details {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
}

.action-title-row {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    font-size: 0.95rem;
}

.action-prefix {
    color: var(--ink-dim);
    font-size: 0.88rem;
}

.action-name {
    font-family: var(--font-display);
    font-size: 1.05rem;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    color: var(--ink);
}

.status-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
}

.verdict-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 1px 7px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 700;
    font-family: var(--font-display);
    letter-spacing: 0.2px;
    text-transform: uppercase;
}

.verdict-tag.blocked {
    background: rgb(232 53 46 / 15%);
    color: #b71c1c;
    border: 1px solid rgb(232 53 46 / 35%);
}

.verdict-tag.active {
    background: rgb(76 201 95 / 20%);
    color: #1b5e20;
    border: 1px solid rgb(76 201 95 / 35%);
}

.status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
}

.verdict-tag.blocked .status-dot {
    animation: pulse-dot 1.2s ease-in-out infinite;
}

@keyframes pulse-dot {
    0%,
    100% {
        opacity: 1;
        transform: scale(1);
    }
    50% {
        opacity: 0.4;
        transform: scale(1.3);
    }
}

.countdown-text {
    font-size: 0.84rem;
    color: var(--ink-dim);
    font-variant-numeric: tabular-nums;
}

/* 3. Actions button styling */
.actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
}

.nope-btn {
    font-weight: 700;
    letter-spacing: 0.5px;
}

.pass-btn {
    white-space: nowrap;
}

.waiting-label {
    color: var(--ink-dim);
    font-size: 0.85rem;
}
</style>
