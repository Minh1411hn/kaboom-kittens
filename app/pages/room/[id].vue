<script setup lang="ts">
import type {
    Card,
    CardId,
    DeckOverrides,
    InteractionResponse,
} from "#shared/types/game";
import { CARD_CATALOG } from "#shared/types/game";

const route = useRoute();
const roomId = computed(() => String(route.params.id).toUpperCase());

const { nickname, avatarId, ready, load, setProfile } = useSession();
const {
    state,
    hostId,
    roomName,
    chat,
    pending,
    playerId,
    status,
    error,
    kicked,
    connect,
    send,
    resetRoom,
    leaveOnPageHide,
} = useGameSocket();

await load();

const selectedUids = ref<string[]>([]);
const targetId = ref<string | null>(null);
const namedCardId = ref<CardId | null>(null);
const logOpen = ref(true);
const confirmingQuit = ref(false);
const targetModalOpen = ref(false);
const peekDismissed = ref(false);
const arrivingCards = ref<Card[]>([]);
const profileDialogOpen = ref(false);
const savingProfile = ref(false);
/** True between a drag's drop and the snapshot that answers it, so you cannot draw twice. */
const drawPending = ref(false);

// --- derived state ---------------------------------------------------------

const you = computed(() => state.value?.you ?? null);
/**
 * You walked into a room whose game had already started (or that was full), so
 * you have no seat — the server sends the public table and nothing else. The
 * watcher below claims a seat as soon as the room goes back to waiting.
 */
const spectating = computed(() => Boolean(state.value && !you.value));
const hand = computed<Card[]>(() => you.value?.hand ?? []);
const selectedCards = computed(() =>
    hand.value.filter((c) => selectedUids.value.includes(c.uid)),
);
const isYourTurn = computed(() =>
    Boolean(
        state.value &&
        you.value &&
        state.value.currentPlayerId === you.value.id,
    ),
);
const isHost = computed(() =>
    Boolean(you.value && hostId.value === you.value.id),
);
const inLobby = computed(
    () =>
        state.value?.status === "lobby" ||
        (state.value?.status === "over" && youAreReady.value),
);
const isPlaying = computed(() => state.value?.status === "playing");
const isOver = computed(
    () => state.value?.status === "over" && !youAreReady.value,
);
const youAreSeated = computed(() =>
    Boolean(state.value?.players.some((p) => p.id === you.value?.id)),
);
const alive = computed(() =>
    Boolean(state.value?.players.find((p) => p.id === you.value?.id)?.alive),
);
const canQuit = computed(
    () => isPlaying.value && alive.value && youAreSeated.value,
);

/** Your own seat sits at the bottom-left; everyone else arcs across the top. */
const selfPlayer = computed(
    () => state.value?.players.find((p) => p.id === you.value?.id) ?? null,
);
const others = computed(() => {
    const players = state.value?.players ?? [];
    if (!you.value || selfPlayer.value?.seat === undefined) {
        return players;
    }

    const yourSeat = selfPlayer.value.seat;
    const n = players.length;
    const result = [];

    // Order cyclically starting from the player to your immediate "left" (seat + 1)
    for (let i = 1; i < n; i++) {
        const seat = (yourSeat + i) % n;
        const player = players.find((p) => p.seat === seat);
        if (player) result.push(player);
    }
    return result;
});
const youAreReady = computed(() => Boolean(selfPlayer.value?.ready));
const readyCount = computed(
    () => state.value?.players.filter((p) => p.ready).length ?? 0,
);
const connectedCount = computed(
    () => state.value?.players.filter((p) => p.connected).length ?? 0,
);

const intent = usePlayIntent(selectedCards, state, isYourTurn);

// --- the Exploding Kitten ceremony -----------------------------------------

const handFan = useTemplateRef<{ slotRect: (uid: string) => DOMRect | null }>(
    "handFan",
);
const tableCenter = useTemplateRef<{ discardRect: () => DOMRect | null }>(
    "tableCenter",
);

const kitten = useKittenCeremony({
    state,
    youId: () => you.value?.id,
    captureRect: (uid) => handFan.value?.slotRect(uid) ?? null,
});

useTurnSound({ state, youId: () => you.value?.id });

// --- voice chat ------------------------------------------------------------

const {
    available: voiceAvailable,
    micOn: voiceMicOn,
    needsGesture: voiceNeedsGesture,
    isMuted: voiceIsMuted,
    isSpeaking: voiceIsSpeaking,
    micOnFor: voiceMicOnFor,
    toggleMute: voiceToggleMute,
    start: startVoice,
    stop: stopVoice,
} = useVoiceChat();
const audioDialogOpen = ref(false);
const voiceSinks = useTemplateRef<{ resume: () => void }>("voiceSinks");

const discardRect = () => tableCenter.value?.discardRect() ?? null;

const nopeWindow = computed(() => state.value?.nopeWindow ?? null);
const hasNope = computed(() => hand.value.some((c) => c.id === "nope"));
const youPlayedTop = computed(
    () => state.value?.actionStack.at(-1)?.playerId === you.value?.id,
);
const passedAlready = computed(() =>
    Boolean(you.value && nopeWindow.value?.passed.includes(you.value.id)),
);

const canDraw = computed(
    () =>
        isYourTurn.value &&
        !state.value?.interaction &&
        !nopeWindow.value &&
        alive.value &&
        !drawPending.value,
);

// --- drag to draw ----------------------------------------------------------

/** The uid the drag delivered, held just long enough for HandFan to flip it. */
const flipUid = ref<string | null>(null);
const handArea = useTemplateRef<HTMLElement>("handArea");
const handAreaRect = computed(
    () => handArea.value?.getBoundingClientRect() ?? null,
);
let flipTimer: ReturnType<typeof setTimeout> | undefined;
/** The hand as it stood when you let go, to spot what the draw delivered. */
let handAtDrop = new Set<string>();

const drawDrag = useDrawDrag({
    canDraw: () => canDraw.value,
    dropRect: () => handArea.value?.getBoundingClientRect() ?? null,
    onDrop: () => {
        handAtDrop = new Set(hand.value.map((c) => c.uid));
        drawPending.value = true;
        send({ type: "draw-card" });
    },
});

function settleDraw(): void {
    if (!drawPending.value) return;
    drawPending.value = false;
    drawDrag.resolve();
}

function onCardLanded(uid: string): void {
    flipUid.value = uid;
    clearTimeout(flipTimer);
    flipTimer = setTimeout(() => (flipUid.value = null), 400);
    arrivingCards.value = arrivingCards.value.filter((c) => c.uid !== uid);
}

// The next snapshot is the answer, whatever it contains. An `error` arrives on
// its own with no snapshot behind it, so it needs its own release.
watch(state, () => settleDraw());
watch(error, (message) => {
    if (message) settleDraw();
});
// The composable gives up on a silent server after a few seconds. Follow it back
// to idle, or a lost reply would leave the deck disabled for the rest of the game.
watch(drawDrag.phase, (phase) => {
    if (phase === "idle") drawPending.value = false;
});
// The turn clock can expire mid-drag, at which point the server draws for you.
// Let go of a card that is no longer yours to place.
watch(isYourTurn, (mine) => {
    if (!mine) drawDrag.cancel();
});

onBeforeUnmount(() => clearTimeout(flipTimer));

/** Choosing a target puts the table into a "pick a seat" mode. */
const pickingTarget = computed(
    () => intent.value.ok && intent.value.needsTarget && !targetId.value,
);

const targetablePlayers = computed(() => {
    if (!pickingTarget.value) return new Set<string>();
    return new Set(
        (state.value?.players ?? [])
            .filter((p) => p.alive && p.id !== you.value?.id && p.handCount > 0)
            .map((p) => p.id),
    );
});

const currentPlayer = computed(
    () =>
        state.value?.players.find(
            (p) => p.id === state.value?.currentPlayerId,
        ) ?? null,
);
const currentPlayerName = computed(() => currentPlayer.value?.nickname ?? "…");
const currentPlayerColor = computed(() =>
    currentPlayer.value
        ? seatColors(currentPlayer.value.seat, currentPlayer.value.alive).base
        : "var(--ink-dim)",
);

/** One line of guidance, in priority order, for the banner. */
const bannerHint = computed(() => {
    if (intent.value.reason) return intent.value.reason;
    if (pickingTarget.value) return "Hãy chọn một người chơi ở phía trên.";
    if (drawDrag.dragging.value) return "Thả vào bộ bài trên tay để rút.";
    if (isYourTurn.value)
        return "Đánh bài hoặc kéo chồng bài rút về tay để kết thúc lượt.";
    return "";
});

const winner = computed(
    () =>
        state.value?.players.find((p) => p.id === state.value?.winnerId)
            ?.nickname ?? null,
);

const namedCardOptions = CARD_CATALOG.map((c) => ({ id: c.id, name: c.name }));

/**
 * A shallow arch across the top of the table: the middle seats sit highest, as
 * if they were on the far side. Same parabola trick as the hand fan's tilt.
 */
function arcOffset(index: number, count: number): string {
    if (count < 3) return "none";
    const middle = (count - 1) / 2;
    const norm = (index - middle) / middle;
    return `translateY(${-(1 - norm * norm) * 24}px)`;
}

// --- lifecycle -------------------------------------------------------------

let stopPageHide: (() => void) | undefined;

onMounted(() => {
    resetRoom();
    stopPageHide = leaveOnPageHide();
    if (nickname.value) join();
});

let joined = false;

function join() {
    joined = true;
    connect();
    // Voice is independent of the game socket: it has its own connection to
    // the SFU and survives a socket blip, so it is started once here and torn
    // down only when the page goes away.
    void startVoice();
    // A socket carried over from the lobby page is already open, so nothing
    // would wake the watcher below — send now instead.
    if (status.value === "open") send({ type: "join", roomId: roomId.value });
}

/**
 * Re-join on every fresh socket. A dropped connection now frees the seat while
 * the room is waiting, and mid-game it flags a disconnect — either way the new
 * socket starts with no room attached, so without this the table would go quiet
 * after a blip.
 */
watch(status, (now, before) => {
    if (joined && now === "open" && before !== "open") {
        send({ type: "join", roomId: roomId.value });
    }
});

function onNicknameSet() {
    join();
}

onBeforeUnmount(() => {
    stopPageHide?.();
    stopVoice();
    if (state.value) send({ type: "leave" });
});

/**
 * A spectator becomes a player the moment the room goes back to waiting. The
 * request is the ordinary `join`, so a room that filled up in the meantime just
 * leaves you watching; we ask again whenever the roster changes, which is the
 * only way a seat can open up.
 */
let seatAskedAt = -1;
watch(
    () => [spectating.value, state.value?.status, state.value?.players.length],
    () => {
        if (!spectating.value) {
            seatAskedAt = -1;
            return;
        }
        const seated = state.value?.players.length ?? 0;
        if (state.value?.status !== "lobby" || seatAskedAt === seated) return;
        seatAskedAt = seated;
        send({ type: "join", roomId: roomId.value });
    },
);

// Track cards leaving hand and detect newly arrived cards
let knownHandUids = new Set<string>();
let initializedHand = false;

watch(hand, (cards) => {
    const uids = new Set(cards.map((c) => c.uid));
    selectedUids.value = selectedUids.value.filter((uid) => uids.has(uid));

    if (!isPlaying.value) {
        knownHandUids = new Set(cards.map((c) => c.uid));
        initializedHand = false;
        return;
    }

    if (!initializedHand) {
        knownHandUids = new Set(cards.map((c) => c.uid));
        initializedHand = true;
        return;
    }

    const incoming = cards.filter((c) => !knownHandUids.has(c.uid));
    if (incoming.length > 0) {
        arrivingCards.value = incoming;
    }
    knownHandUids = new Set(cards.map((c) => c.uid));
});

watch(selectedUids, () => {
    targetId.value = null;
    namedCardId.value = null;
});

watch(
    () => you.value?.peek,
    (newPeek, oldPeek) => {
        if (newPeek && newPeek.length > 0) {
            const newKey = newPeek.map((c) => c.uid).join(",");
            const oldKey = oldPeek?.map((c) => c.uid).join(",");
            // If the deck was drawn from, the new peek is just a suffix of the old peek.
            // In this case, we shouldn't pop up the modal again.
            if (newKey !== oldKey && (!oldKey || !oldKey.endsWith(newKey))) {
                peekDismissed.value = false;
            }
        } else {
            peekDismissed.value = false;
        }
    },
    { deep: true },
);

const showPeekModal = computed(() =>
    Boolean(
        you.value?.peek?.length &&
        !peekDismissed.value &&
        alive.value &&
        !isOver.value,
    ),
);

// Alter the Future rides the generic interaction system, but gets its own
// dialog (shared with See the Future) instead of InteractionModal's generic
// prompt renderer. `cards` is only populated for the player who must answer,
// so its presence already implies this interaction is for you.
const showAlterFutureModal = computed(() =>
    Boolean(
        state.value?.interaction?.kind === "reorder-cards" &&
        state.value.interaction.cards,
    ),
);

// Same idea for choosing where the defused kitten goes back into the deck —
// its own dialog (DeckPositionModal) instead of InteractionModal's generic
// prompt renderer. This kind carries no `cards`, so gate on `isForYou`
// instead. It also waits for the kitten ceremony (reveal, then the Defuse
// flying to the discard) to finish, so the dialog is the last beat rather
// than the only one you see.
const showDeckPositionModal = computed(() =>
    Boolean(
        state.value?.interaction?.kind === "choose-deck-position" &&
        state.value.interaction.isForYou &&
        !kitten.blocking.value,
    ),
);

// --- actions ---------------------------------------------------------------

function toggle(uid: string) {
    if (!alive.value) return;
    selectedUids.value = selectedUids.value.includes(uid)
        ? selectedUids.value.filter((u) => u !== uid)
        : [...selectedUids.value, uid];
}

function pickTarget(id: string) {
    targetId.value = id;
}

function onTargetConfirmed(selectedTarget: string, demandedCard?: CardId) {
    targetId.value = selectedTarget;
    if (demandedCard) {
        namedCardId.value = demandedCard;
    }
    targetModalOpen.value = false;
    executePlay();
}

function play() {
    if (!intent.value.ok) return;
    if (intent.value.needsTarget && !targetId.value) {
        targetModalOpen.value = true;
        return;
    }
    if (intent.value.needsNamedCard && !namedCardId.value) {
        targetModalOpen.value = true;
        return;
    }
    executePlay();
}

function executePlay() {
    send({
        type: "play-card",
        uids: [...selectedUids.value],
        combo: intent.value.combo,
        targetPlayerId: targetId.value ?? undefined,
        namedCardId: namedCardId.value ?? undefined,
    });
    selectedUids.value = [];
    targetId.value = null;
    namedCardId.value = null;
}

const draw = () => send({ type: "draw-card" });
const startGame = () => send({ type: "start-game" });
const setDeckOverrides = (overrides: DeckOverrides) =>
    send({ type: "set-deck-overrides", overrides });
const say = (text: string) => send({ type: "chat", text });
const submitInteraction = (response: InteractionResponse) => {
    const id = state.value?.interaction?.id;
    if (id) send({ type: "submit-interaction", interactionId: id, response });
};
const onAlterFutureSubmit = (uids: string[]) =>
    submitInteraction({ type: "order", uids });
const onDeckPositionSubmit = (index: number) =>
    submitInteraction({ type: "position", index });

function playNope() {
    const nope = hand.value.find((c) => c.id === "nope");
    if (nope) send({ type: "play-card", uids: [nope.uid], combo: null });
}

async function leaveToLobby() {
    send({ type: "leave" });
    await navigateTo("/");
}

function returnToLobby() {
    send({ type: "return-to-lobby" });
}

async function onProfileSave(nicknameValue: string, avatarIdValue: string) {
    if (savingProfile.value) return;
    savingProfile.value = true;
    try {
        // REST first: the durable write, works even if the socket is down.
        await setProfile(nicknameValue, avatarIdValue);
        // Then tell the room to broadcast the change to every other player.
        send({
            type: "update-profile",
            nickname: nicknameValue,
            avatarId: avatarIdValue,
        });
        profileDialogOpen.value = false;
    } finally {
        savingProfile.value = false;
    }
}

function kickPlayer(targetPlayerId: string) {
    send({ type: "kick-player", targetPlayerId });
}

function askToQuit() {
    confirmingQuit.value = true;
}

async function quitGame() {
    confirmingQuit.value = false;
    send({ type: "quit-game" });
    await navigateTo("/");
}

function cancelQuit() {
    confirmingQuit.value = false;
}
</script>

<template>
    <div class="room" :class="{ 'red-theme': !state || inLobby }">
        <NicknameGate v-if="ready && !nickname" @done="onNicknameSet" />

        <template v-else-if="ready">
            <header class="topbar">
                <div class="row">
                    <button
                        class="icon"
                        title="Quay lại sảnh chờ"
                        @click="leaveToLobby"
                    >
                        <Icon name="lucide:arrow-left" aria-hidden="true" />
                    </button>
                    <button
                        v-if="canQuit"
                        class="icon danger"
                        title="Rời trận — bạn sẽ bị xử thua"
                        @click="askToQuit"
                    >
                        <Icon name="lucide:log-out" aria-hidden="true" /> Rời trận
                    </button>
                    <div class="stack tight">
                        <strong class="room-title">{{
                            roomName || "Đang tải…"
                        }}</strong>
                        <span class="muted small">Phòng {{ roomId }}</span>
                    </div>
                </div>
                <div class="row">
                    <button
                        v-if="voiceAvailable"
                        class="icon"
                        title="Cài đặt âm thanh"
                        @click="audioDialogOpen = true"
                    >
                        <Icon :name="voiceMicOn ? 'lucide:mic' : 'lucide:mic-off'" aria-hidden="true" />
                    </button>
                    <span
                        class="dot"
                        :class="status"
                        :title="`Trạng thái: ${status}`"
                    />
                    <CurrentUserButton
                        :nickname="nickname"
                        :avatar-id="avatarId"
                        :clickable="inLobby"
                        @click="inLobby && (profileDialogOpen = true)"
                    />
                </div>
            </header>

            <ProfileDialog
                v-if="profileDialogOpen"
                :nickname="nickname"
                :avatar-id="avatarId"
                :saving="savingProfile"
                @save="onProfileSave"
                @cancel="profileDialogOpen = false"
            />

            <AudioSettingsDialog
                v-if="audioDialogOpen"
                @cancel="audioDialogOpen = false"
            />

            <VoiceAudioSinks ref="voiceSinks" />

            <button
                v-if="voiceNeedsGesture"
                class="panel notice gesture-prompt"
                @click="voiceSinks?.resume()"
            >
                <Icon name="lucide:volume-2" aria-hidden="true" /> Bấm để bật tiếng người chơi khác
            </button>

            <p v-if="kicked" class="panel notice">{{ kicked }}</p>
            <p v-if="error" class="error banner">{{ error }}</p>
            <p v-if="spectating" class="panel notice">
                {{
                    state?.status === "lobby"
                        ? "Phòng đã đầy — bạn đang theo dõi, sẽ vào bàn ngay khi có chỗ trống."
                        : "Bạn đang xem ván đấu — sẽ vào bàn khi ván này kết thúc."
                }}
            </p>

            <p v-if="!state" class="panel muted">Đang tham gia phòng chơi…</p>

            <!-- ------------------------------------------------ pre-game lobby -->
            <section v-else-if="inLobby" class="lobby">
                <div class="lobby-content">
                    <div class="lobby-left panel">
                        <h2 class="lobby-heading">Danh sách player</h2>
                        <div class="lobby-seats vertical">
                            <div
                                v-for="player in state.players"
                                :key="player.id"
                                class="lobby-seat-wrap"
                            >
                                <PlayerSeat
                                    :player="player"
                                    :is-current="false"
                                    :is-host="player.id === hostId"
                                    :is-you="player.id === you?.id"
                                    :turns-remaining="0"
                                    layout="horizontal"
                                    :voice-mic-on="voiceMicOnFor(player.id)"
                                    :voice-speaking="
                                        voiceIsSpeaking(
                                            player.id === you?.id
                                                ? 'self'
                                                : player.id,
                                        )
                                    "
                                    :voice-muted="voiceIsMuted(player.id)"
                                    :voice-interactive="player.id !== you?.id"
                                    @toggle-voice-mute="voiceToggleMute"
                                />
                                <span
                                    class="conn-tag"
                                    :class="
                                        player.connected ? 'online' : 'offline'
                                    "
                                >
                                    {{
                                        player.connected
                                            ? "Đã kết nối"
                                            : "Mất kết nối"
                                    }}
                                </span>
                                <button
                                    v-if="isHost && player.id !== you?.id"
                                    class="kick-btn"
                                    title="Mời ra khỏi phòng"
                                    @click="kickPlayer(player.id)"
                                >
                                    Kick
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="lobby-right panel">
                        <h2 class="lobby-heading">Cài đặt phòng</h2>
                        <div class="lobby-actions">
                            <p class="muted">
                                Đã có {{ state.players.length }}/10 người tham
                                gia. Chia sẻ liên kết này để rủ bạn bè cùng
                                chơi:
                            </p>
                            <ShareLink :room-id="roomId" />

                            <div class="start-game-container">
                                <button
                                    v-if="isHost"
                                    class="primary start-btn"
                                    :disabled="
                                        state.players.length < 2 ||
                                        state.status === 'over'
                                    "
                                    @click="startGame"
                                >
                                    {{
                                        state.status === "over"
                                            ? "Đang chờ mọi người…"
                                            : "Bắt đầu ván đấu"
                                    }}
                                </button>
                                <p v-else class="muted">
                                    {{
                                        state.status === "over"
                                            ? "Đang chờ mọi người…"
                                            : "Đang chờ chủ phòng bắt đầu ván đấu…"
                                    }}
                                </p>
                            </div>
                        </div>

                        <DeckSettingsPanel
                            :deck="state.deck"
                            :is-host="isHost"
                            @update="setDeckOverrides"
                        />
                    </div>
                </div>
            </section>

            <!-- ------------------------------------------------------ the table -->
            <section v-else class="stage">
                <!-- Everyone else, arced across the far side of the table. -->
                <div class="seat-arc">
                    <div
                        v-for="(player, index) in others"
                        :key="player.id"
                        class="arc-slot"
                        :style="{ transform: arcOffset(index, others.length) }"
                    >
                        <PlayerSeat
                            :player="player"
                            :is-current="player.id === state.currentPlayerId"
                            :is-host="player.id === hostId"
                            :is-you="false"
                            :turns-remaining="state.turn.turnsRemaining"
                            :targetable="targetablePlayers.has(player.id)"
                            :selected="targetId === player.id"
                            :voice-mic-on="voiceMicOnFor(player.id)"
                            :voice-speaking="voiceIsSpeaking(player.id)"
                            :voice-muted="voiceIsMuted(player.id)"
                            voice-interactive
                            @pick="pickTarget"
                            @toggle-voice-mute="voiceToggleMute"
                        />
                    </div>
                </div>

                <div class="center-area">
                    <TableCenter
                        ref="tableCenter"
                        :draw-count="state.drawCount"
                        :discard-top="state.discardTop"
                        :discard-count="state.discardCount"
                        :direction="state.turn.direction"
                        :can-draw="canDraw"
                        :deadline="state.turnDeadline"
                        :dragging="drawDrag.dragging.value"
                        @draw="draw"
                        @draw-pointer-down="drawDrag.start"
                    />
                </div>

                <div class="banner-area">
                    <TurnBanner
                        :is-your-turn="isYourTurn"
                        :current-player-name="currentPlayerName"
                        :hint="bannerHint"
                        :deadline="state.turnDeadline"
                        :actor-color="currentPlayerColor"
                    >
                        <template v-if="youAreSeated && alive && !isOver">
                            <select
                                v-if="intent.needsNamedCard"
                                v-model="namedCardId"
                                aria-label="Card to demand"
                            >
                                <option :value="null" disabled>
                                    Chọn loại bài muốn đòi?
                                </option>
                                <option
                                    v-for="option in namedCardOptions"
                                    :key="option.id"
                                    :value="option.id"
                                >
                                    {{ option.name }}
                                </option>
                            </select>

                            <button
                                class="primary"
                                :disabled="!intent.ok"
                                @click="play"
                            >
                                Đánh {{ selectedUids.length || "" }}
                            </button>

                            <button
                                :disabled="!selectedUids.length"
                                @click="selectedUids = []"
                            >
                                Bỏ chọn
                            </button>
                        </template>
                    </TurnBanner>
                </div>

                <!-- Your own seat, bottom-left. -->
                <div class="self-area">
                    <PlayerSeat
                        v-if="selfPlayer"
                        :player="selfPlayer"
                        :is-current="isYourTurn"
                        :is-host="isHost"
                        :is-you="true"
                        :turns-remaining="state.turn.turnsRemaining"
                        :voice-mic-on="voiceMicOnFor(selfPlayer.id)"
                        :voice-speaking="voiceIsSpeaking('self')"
                    />
                </div>

                <div
                    ref="handArea"
                    class="hand-area"
                    :class="{ 'drop-active': drawDrag.dragging.value }"
                >
                    <HandFan
                        v-if="youAreSeated && alive && !isOver"
                        ref="handFan"
                        :hand="hand"
                        :selected="selectedUids"
                        :disabled="!isYourTurn && !hasNope"
                        :flip-uid="flipUid"
                        :hold-leave="kitten.holdLeave.value"
                        @toggle="toggle"
                    />
                    <p v-else-if="!youAreSeated" class="watching">
                        Ván đấu đang diễn ra — bạn đang theo dõi với tư cách
                        khán giả.
                    </p>
                    <p v-else-if="!alive" class="watching">
                        <Icon name="lucide:bomb" aria-hidden="true" /> Bạn đã bị nổ tung — hãy ở lại xem ai sẽ là người sống
                        sót cuối cùng!
                    </p>
                </div>

                <DrawGhost
                    v-if="drawDrag.ghostVisible.value"
                    :phase="drawDrag.phase.value"
                    :x="drawDrag.x.value"
                    :y="drawDrag.y.value"
                    :reduced-motion="drawDrag.reducedMotion"
                />

                <Transition name="slide">
                    <NopeBar
                        v-if="nopeWindow"
                        class="nope-overlay"
                        :stack="state.actionStack"
                        :deadline="nopeWindow.deadline"
                        :players="state.players"
                        :has-nope="hasNope"
                        :you-played-top="youPlayedTop"
                        :passed="passedAlready"
                        @nope="playNope"
                        @pass="send({ type: 'pass-nope' })"
                    />
                </Transition>

                <!--
          Only the end of the game draws the curtain. Being eliminated leaves the
          table visible, because watching the rest burn is the consolation prize.
        -->
                <Transition name="fade">
                    <div v-if="isOver" class="curtain">
                        <div class="panel result">
                            <h2>
                                <Icon v-if="winner" name="lucide:trophy" aria-hidden="true" />
                                {{ winner ? `${winner} đã chiến thắng!` : "Ván đấu kết thúc" }}
                            </h2>
                            <div class="lobby-seats">
                                <PlayerSeat
                                    v-for="player in state.players"
                                    :key="player.id"
                                    :player="player"
                                    :is-current="false"
                                    :is-host="player.id === hostId"
                                    :is-you="player.id === you?.id"
                                    :turns-remaining="0"
                                />
                            </div>
                            <div v-if="youAreSeated" class="row">
                                <button class="secondary" @click="leaveToLobby">
                                    Rời phòng
                                </button>
                                <button
                                    class="primary"
                                    :disabled="youAreReady"
                                    @click="returnToLobby"
                                >
                                    {{
                                        youAreReady
                                            ? `Đang chờ người chơi khác (${readyCount}/${connectedCount})…`
                                            : "Sẵn sàng ván mới"
                                    }}
                                </button>
                            </div>
                            <div v-else class="row">
                                <button class="primary" @click="leaveToLobby">
                                    Rời phòng
                                </button>
                            </div>
                        </div>
                    </div>
                </Transition>
            </section>

            <!-- Chat and the story of the game, tucked into a corner. -->
            <div v-if="state" class="log-dock" :class="{ open: logOpen }">
                <button class="log-toggle" @click="logOpen = !logOpen">
                    {{ logOpen ? "Ẩn lịch sử" : "Lịch sử & Chat" }}
                    <Icon :name="logOpen ? 'lucide:chevron-down' : 'lucide:chevron-up'" aria-hidden="true" />
                </button>
                <EventLog
                    v-show="logOpen"
                    :events="pending"
                    :chat="chat"
                    @say="say"
                />
            </div>

            <InteractionModal
                v-if="
                    state?.interaction &&
                    !['reorder-cards', 'choose-deck-position'].includes(
                        state.interaction.kind,
                    )
                "
                :interaction="state.interaction"
                :hand="hand"
                :players="state.players"
                :you-id="state.you?.id ?? null"
                @submit="submitInteraction"
            />

            <SeeFutureModal
                v-if="showAlterFutureModal"
                :cards="state?.interaction?.cards ?? []"
                editable
                @submit="onAlterFutureSubmit"
            />

            <SeeFutureModal
                v-if="showPeekModal"
                :cards="you?.peek ?? []"
                @close="peekDismissed = true"
            />

            <DeckPositionModal
                v-if="showDeckPositionModal"
                :interaction="state!.interaction!"
                @submit="onDeckPositionSubmit"
            />

            <TargetSelectModal
                v-if="targetModalOpen"
                :players="state?.players ?? []"
                :you-id="you?.id"
                :combo="intent.combo"
                :card-id="selectedCards[0]?.id"
                :needs-named-card="intent.needsNamedCard"
                :initial-target-id="targetId"
                :initial-named-card-id="namedCardId"
                @confirm="onTargetConfirmed"
                @cancel="targetModalOpen = false"
            />

            <CardArrivalFlyer
                :arriving-cards="arrivingCards"
                :hand-area-rect="handAreaRect"
                @landed="onCardLanded"
            />

            <!--
              Drawing an Exploding Kitten, staged: the whole table sees the
              reveal, then the drawer's Defuse flies to the discard, and only
              then does DeckPositionModal above get its turn.
            -->
            <KittenRevealOverlay
                v-if="kitten.revealSeq.value !== null"
                :uid="`kitten-${kitten.revealSeq.value}`"
                :player-name="kitten.revealPlayerName.value"
                :defused="kitten.revealDefused.value"
            />

            <CardDepartureFlyer
                :card="kitten.defuseCard.value"
                :from-rect="kitten.defuseFromRect.value"
                :measure-to="discardRect"
                @done="kitten.onDefuseFlightDone"
            />

            <ConfirmDialog
                v-if="confirmingQuit"
                title="Rời khỏi trận đấu?"
                message="Bạn sẽ bị loại khỏi ván này và không thể tham gia lại cho đến khi ván mới bắt đầu."
                confirm-label="Rời trận"
                cancel-label="Ở lại"
                @confirm="quitGame"
                @cancel="cancelQuit"
            />
        </template>
    </div>
</template>

<style scoped>
/*
 * `.red-theme` is toggled on `.room` for the pre-game states only (no
 * session state yet, or the waiting-room lobby) — never while `.stage`
 * (the live table, including the post-game curtain) is showing. Scoped
 * entirely to this file so it can't affect the live game table.
 */
.room {
    position: relative;
    max-width: 1400px;
    margin: 0 auto;
    padding: 0.85rem 1.25rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
}

.room.red-theme::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    background-image: url("/common/background-red-texture.png");
    background-repeat: no-repeat;
    background-size: cover;
    background-position: center center;
}

.red-theme .panel {
    background: rgba(30, 5, 5, 0.85);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 16px;
    color: var(--text);
    box-shadow:
        0 20px 40px rgba(0, 0, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.start-game-container {
    display: flex;
    justify-content: center;
    margin: 1.5rem 0 0.5rem;
}

.start-btn {
    font-size: 1.5rem;
    padding: 1rem 2.5rem;
    box-shadow: 0 8px 24px rgba(255, 122, 26, 0.4);
}

.red-theme .panel h2 {
    color: var(--text);
}

.red-theme .panel .muted {
    color: var(--text-dim);
}

.topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.4rem 0.75rem;
    border-radius: 999px;
    background: linear-gradient(
        180deg,
        rgb(255 255 255 / 10%),
        rgb(0 0 0 / 18%)
    );
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 18%),
        var(--shadow-sm);
}

.room-title {
    font-family: var(--font-display);
    font-size: 1.1rem;
    letter-spacing: 0.8px;
    text-transform: uppercase;
}

.icon {
    padding: 0.35rem 0.8rem;
    font-size: 1.05rem;
}

.tight {
    gap: 0.05rem;
}

.small {
    font-size: 0.78rem;
}

/* Autoplay was blocked; one click on this wakes every remote audio element. */
.gesture-prompt {
    display: block;
    width: 100%;
    text-align: center;
    cursor: pointer;
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

.banner,
.notice {
    margin: 0;
}

.red-theme .error.banner {
    text-shadow: 0 1px 3px rgb(0 0 0 / 60%);
    font-weight: 600;
}

.lobby {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.lobby-heading {
    color: var(--accent);
}

.lobby-content {
    display: flex;
    gap: 2rem;
}

.lobby-left,
.lobby-right {
    flex: 1;
}

.lobby-right {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

.lobby-actions {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.lobby-seats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.9rem;
    justify-content: center;
    padding: 0.5rem 0;
}

.lobby-seats.vertical {
    flex-direction: column;
    align-items: stretch;
    width: 100%;
}

.lobby-seat-wrap {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
}

.conn-tag {
    flex: none;
    padding: 0.25rem 0.6rem;
    border: 1.5px solid;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.3px;
    white-space: nowrap;
}

.conn-tag.online {
    color: var(--good);
    border-color: var(--good);
}

.conn-tag.offline {
    color: var(--bad);
    border-color: var(--bad);
}

.kick-btn {
    flex: none;
    padding: 0.4rem 0.85rem;
    border-radius: 8px;
    font-family: var(--font-display);
    font-size: 0.78rem;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    background: var(--bad);
    color: var(--text);
    box-shadow: 0 1px 3px rgb(0 0 0 / 45%);
}

.kick-btn:hover {
    background: #ff4b43;
}

/* ------------------------------------------------------------ the table */

.stage {
    position: relative;
    display: grid;
    grid-template-columns: 132px minmax(0, 1fr) 300px;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 1rem 1.25rem;
    align-items: center;
    min-height: 74vh;
    padding: 1.25rem 1.5rem 1.5rem;
    border-radius: 26px;
}

.seat-arc {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: flex-start;
    gap: 0.5rem 1.4rem;
    padding-top: 0.5rem;
    min-height: 132px;
}

.center-area {
    grid-column: 1 / 3;
    display: grid;
    place-items: center;
}

.banner-area {
    grid-column: 3;
    display: flex;
    justify-content: center;
    align-self: start;
    padding-top: 0.5rem;
}

.self-area {
    grid-column: 1;
    display: grid;
    place-items: center;
    align-self: end;
}

.hand-area {
    grid-column: 2 / -1;
    align-self: end;
    min-height: 150px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    border-radius: 22px;
    border: 2px dashed transparent;
    transition:
        border-color 0.15s ease,
        background 0.15s ease,
        box-shadow 0.15s ease;
}

/* The drop target for a draw. Same warm accent as the deck's own glow, so it
   reads as "this is where that card goes". */
.hand-area.drop-active {
    border-color: rgb(255 194 26 / 70%);
    background: rgb(255 194 26 / 8%);
    box-shadow: inset 0 0 34px rgb(255 140 40 / 30%);
}

.watching {
    margin: 0 0 1.5rem;
    color: var(--text-dim);
    text-align: center;
}

/* The Nope window is urgent, so it floats over the piles. */
.nope-overlay {
    position: absolute;
    left: 50%;
    top: 46%;
    transform: translate(-50%, -50%);
    width: min(680px, 82%);
    z-index: 8;
}

.curtain {
    position: absolute;
    inset: 0;
    z-index: 12;
    display: grid;
    place-items: center;
    border-radius: 26px;
    background: rgb(20 8 0 / 62%);
    backdrop-filter: blur(2px);
}

.result {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    align-items: center;
    padding: 1.6rem 2.2rem;
}

.result h2 {
    font-size: 2rem;
}

/* --------------------------------------------------------- log and chat */

.log-dock {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 15;
    width: min(360px, calc(100vw - 2rem));
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.4rem;
    opacity: 0.8;
    transition: opacity 0.2s ease;
}

.log-dock:hover,
.log-dock:focus-within {
    opacity: 1;
}

.log-toggle {
    font-family: var(--font-display);
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 0.45rem 1rem;
    background: linear-gradient(180deg, #4a2810, #2c1607);
    color: #fdf6e7;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 999px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
    cursor: pointer;
    transition:
        filter 0.15s ease,
        transform 0.08s ease;
}

.log-toggle:hover {
    filter: brightness(1.2);
    transform: translateY(-1px);
}

.log-toggle:active {
    transform: translateY(1px);
}

.slide-enter-active,
.slide-leave-active {
    transition:
        opacity 0.2s ease,
        transform 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
    opacity: 0;
    transform: translate(-50%, calc(-50% - 10px));
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
