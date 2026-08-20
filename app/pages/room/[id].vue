<template lang="pug">
  .room
    NicknameGate(v-if="ready && !nickname" @done="onNicknameSet")

    template(v-else-if="ready")
      CommonHeader.room__header(
        :avatar-id="avatarId"
        :clickable="inLobby"
        :nickname="nickname"
        :status="status"
        @profile-click="profileDialogOpen = true"
      )
        template(#left)
          CommonButton(
            aria-label="Quay lại sảnh chờ"
            icon="lucide:arrow-left"
            size="sm"
            variant="ghost"
            @click="leaveToLobby"
          )
          CommonButton(
            v-if="canQuit"
            aria-label="Rời trận — bạn sẽ bị xử thua"
            icon="lucide:log-out"
            label="Rời trận"
            size="sm"
            variant="red"
            @click="askToQuit"
          )
          .room__title
            strong.room__name {{ roomName || "Đang tải…" }}
            span.room__id Phòng {{ roomId }}

        template(#actions)
          CommonButton(
            v-if="voiceAvailable"
            :icon="voiceMicOn ? 'lucide:mic' : 'lucide:mic-off'"
            aria-label="Cài đặt âm thanh"
            size="sm"
            variant="ghost"
            @click="audioDialogOpen = true"
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

      VoiceAudioSinks(ref="voiceSinks")

      button.room__gesture-prompt.panel(v-if="voiceNeedsGesture" @click="voiceSinks?.resume()")
        Icon(aria-hidden="true" name="lucide:volume-2")
        |
        | Bấm để bật tiếng người chơi khác

      p.room__notice.panel(v-if="kicked") {{ kicked }}
      p.room__banner.error(v-if="error") {{ error }}
      p.room__notice.panel(v-if="spectating")
        | {{ state?.status === "lobby" ? "Phòng đã đầy — bạn đang theo dõi, sẽ vào bàn ngay khi có chỗ trống." : "Bạn đang xem ván đấu — sẽ vào bàn khi ván này kết thúc." }}

      p.room__notice.panel.muted(v-if="!state") Đang tham gia phòng chơi…

      //- ------------------------------------------------ pre-game lobby
      section.lobby(v-else-if="inLobby")
        .lobby__content
          .lobby__col.panel
            h2.lobby__heading Danh sách player
            .lobby__seats
              .lobby__seat(v-for="player in state.players" :key="player.id")
                PlayerSeat(
                  :is-current="false"
                  :is-host="player.id === hostId"
                  :is-you="player.id === you?.id"
                  :player="player"
                  :turns-remaining="0"
                  :voice-mic-on="voiceMicOnFor(player.id)"
                  :voice-muted="voiceIsMuted(player.id)"
                  :voice-interactive="player.id !== you?.id"
                  :voice-speaking="voiceIsSpeaking(player.id === you?.id ? 'self' : player.id)"
                  layout="horizontal"
                  @toggle-voice-mute="voiceToggleMute"
                )
                span.lobby__conn(:class="player.connected ? 'lobby__conn--online' : 'lobby__conn--offline'")
                  | {{ player.connected ? "Đã kết nối" : "Mất kết nối" }}
                CommonButton.lobby__kick(
                  v-if="isHost && player.id !== you?.id"
                  aria-label="Mời ra khỏi phòng"
                  label="Kick"
                  size="sm"
                  variant="red"
                  @click="kickPlayer(player.id)"
                )

          .lobby__col.lobby__col--settings.panel
            h2.lobby__heading Cài đặt phòng
            .lobby__actions
              p.muted
                | Đã có {{ state.players.length }}/10 người tham gia. Chia sẻ liên kết này để rủ bạn bè cùng chơi:
              ShareLink(:room-id="roomId")

              .lobby__start
                CommonButton(
                  v-if="isHost"
                  :disabled="state.players.length < 2 || state.status === 'over'"
                  :label="state.status === 'over' ? 'Đang chờ mọi người…' : 'Bắt đầu ván đấu'"
                  size="lg"
                  variant="gold"
                  @click="startGame"
                )
                p.muted(v-else)
                  | {{ state.status === "over" ? "Đang chờ mọi người…" : "Đang chờ chủ phòng bắt đầu ván đấu…" }}

            DeckSettingsPanel(:deck="state.deck" :is-host="isHost" @update="setDeckOverrides")

      //- ------------------------------------------------------ the table
      section.stage(v-else)
        //- Everyone else, arced across the far side of the table.
        .stage__arc
          .stage__arc-slot(
            v-for="(player, index) in others"
            :key="player.id"
            :style="{ transform: arcOffset(index, others.length) }"
          )
            PlayerSeat(
              :is-current="player.id === state.currentPlayerId"
              :is-host="player.id === hostId"
              :is-you="false"
              :player="player"
              :selected="targetId === player.id"
              :targetable="targetablePlayers.has(player.id)"
              :turns-remaining="state.turn.turnsRemaining"
              :voice-mic-on="voiceMicOnFor(player.id)"
              :voice-muted="voiceIsMuted(player.id)"
              :voice-speaking="voiceIsSpeaking(player.id)"
              voice-interactive
              @pick="pickTarget"
              @toggle-voice-mute="voiceToggleMute"
            )

        .stage__center
          TableCenter(
            ref="tableCenter"
            :can-draw="canDraw"
            :deadline="state.turnDeadline"
            :direction="state.turn.direction"
            :discard-count="state.discardCount"
            :discard-top="state.discardTop"
            :draw-count="state.drawCount"
            :dragging="drawDrag.dragging.value"
            @draw="draw"
            @draw-pointer-down="drawDrag.start"
          )

        .stage__banner
          TurnBanner(
            :actor-color="currentPlayerColor"
            :current-player-name="currentPlayerName"
            :deadline="state.turnDeadline"
            :hint="bannerHint"
            :is-your-turn="isYourTurn"
          )
            template(v-if="youAreSeated && alive && !isOver")
              select(v-if="intent.needsNamedCard" v-model="namedCardId" aria-label="Card to demand")
                option(:value="null" disabled) Chọn loại bài muốn đòi?
                option(v-for="option in namedCardOptions" :key="option.id" :value="option.id") {{ option.name }}

              CommonButton(
                :disabled="!intent.ok"
                :label="`Đánh ${selectedUids.length || ''}`"
                size="sm"
                variant="gold"
                @click="play"
              )

              CommonButton(
                :disabled="!selectedUids.length"
                label="Bỏ chọn"
                size="sm"
                variant="ghost"
                @click="selectedUids = []"
              )

        //- Your own seat, bottom-left.
        .stage__self
          PlayerSeat(
            v-if="selfPlayer"
            :is-current="isYourTurn"
            :is-host="isHost"
            :is-you="true"
            :player="selfPlayer"
            :turns-remaining="state.turn.turnsRemaining"
            :voice-mic-on="voiceMicOnFor(selfPlayer.id)"
            :voice-speaking="voiceIsSpeaking('self')"
          )

        .stage__hand(
          ref="handArea"
          :class="{ 'stage__hand--drop-active': drawDrag.dragging.value }"
        )
          HandFan(
            v-if="youAreSeated && alive && !isOver"
            ref="handFan"
            :disabled="!isYourTurn && !hasNope"
            :flip-uid="flipUid"
            :hand="hand"
            :hold-leave="kitten.holdLeave.value"
            :selected="selectedUids"
            @toggle="toggle"
          )
          p.stage__watching(v-else-if="!youAreSeated")
            | Ván đấu đang diễn ra — bạn đang theo dõi với tư cách khán giả.
          p.stage__watching(v-else-if="!alive")
            Icon(aria-hidden="true" name="lucide:bomb")
            |
            | Bạn đã bị nổ tung — hãy ở lại xem ai sẽ là người sống sót cuối cùng!

        DrawGhost(
          v-if="drawDrag.ghostVisible.value"
          :phase="drawDrag.phase.value"
          :reduced-motion="drawDrag.reducedMotion"
          :x="drawDrag.x.value"
          :y="drawDrag.y.value"
        )

        Transition(name="slide")
          NopeBar.stage__nope(
            v-if="nopeWindow"
            :deadline="nopeWindow.deadline"
            :has-nope="hasNope"
            :passed="passedAlready"
            :players="state.players"
            :stack="state.actionStack"
            :you-played-top="youPlayedTop"
            @nope="playNope"
            @pass="send({ type: 'pass-nope' })"
          )

        //-
          Only the end of the game draws the curtain. Being eliminated leaves the
          table visible, because watching the rest burn is the consolation prize.
        Transition(name="fade")
          .stage__curtain(v-if="isOver")
            .stage__result.panel
              h2
                Icon(v-if="winner" aria-hidden="true" name="lucide:trophy")
                | {{ winner ? `${winner} đã chiến thắng!` : "Ván đấu kết thúc" }}
              .stage__result-seats
                PlayerSeat(
                  v-for="player in state.players"
                  :key="player.id"
                  :is-current="false"
                  :is-host="player.id === hostId"
                  :is-you="player.id === you?.id"
                  :player="player"
                  :turns-remaining="0"
                )
              .row(v-if="youAreSeated")
                CommonButton(label="Rời phòng" size="sm" variant="ghost" @click="leaveToLobby")
                CommonButton.stage__ready(
                  :disabled="youAreReady"
                  :label="youAreReady ? `Đang chờ người chơi khác (${readyCount}/${connectedCount})…` : 'Sẵn sàng ván mới'"
                  size="sm"
                  variant="gold"
                  @click="returnToLobby"
                )
              .row(v-else)
                CommonButton(label="Rời phòng" size="sm" variant="gold" @click="leaveToLobby")

      //- Chat and the story of the game, tucked into a corner.
      .log-dock(v-if="state" :class="{ 'log-dock--open': logOpen }")
        button.log-dock__toggle(@click="logOpen = !logOpen")
          | {{ logOpen ? "Ẩn lịch sử" : "Lịch sử & Chat" }}
          Icon(:name="logOpen ? 'lucide:chevron-down' : 'lucide:chevron-up'" aria-hidden="true")
        EventLog(v-show="logOpen" :chat="chat" :events="pending" @say="say")

      InteractionModal(
        v-if="state?.interaction && !['reorder-cards', 'choose-deck-position'].includes(state.interaction.kind)"
        :hand="hand"
        :interaction="state.interaction"
        :players="state.players"
        :you-id="state.you?.id ?? null"
        @submit="submitInteraction"
      )

      SeeFutureModal(
        v-if="showAlterFutureModal"
        :cards="state?.interaction?.cards ?? []"
        editable
        @submit="onAlterFutureSubmit"
      )

      SeeFutureModal(v-if="showPeekModal" :cards="you?.peek ?? []" @close="peekDismissed = true")

      DeckPositionModal(
        v-if="deckPositionInteraction"
        :interaction="deckPositionInteraction"
        @submit="onDeckPositionSubmit"
      )

      TargetSelectModal(
        v-if="targetModalOpen"
        :card-id="selectedCards[0]?.id"
        :combo="intent.combo"
        :initial-named-card-id="namedCardId"
        :initial-target-id="targetId"
        :needs-named-card="intent.needsNamedCard"
        :players="state?.players ?? []"
        :you-id="you?.id"
        @cancel="targetModalOpen = false"
        @confirm="onTargetConfirmed"
      )

      CardArrivalFlyer(
        :arriving-cards="arrivingCards"
        :hand-area-rect="handAreaRect"
        @landed="onCardLanded"
      )

      //-
        Drawing an Exploding Kitten, staged: the whole table sees the
        reveal, then the drawer's Defuse flies to the discard, and only
        then does DeckPositionModal above get its turn.
      KittenRevealOverlay(
        v-if="kitten.revealSeq.value !== null"
        :defused="kitten.revealDefused.value"
        :player-name="kitten.revealPlayerName.value"
        :uid="`kitten-${kitten.revealSeq.value}`"
      )

      CardDepartureFlyer(
        :card="kitten.defuseCard.value"
        :from-rect="kitten.defuseFromRect.value"
        :measure-to="discardRect"
        @done="kitten.onDefuseFlightDone"
      )

      ConfirmDialog(
        v-if="confirmingQuit"
        cancel-label="Ở lại"
        confirm-label="Rời trận"
        message="Bạn sẽ bị loại khỏi ván này và không thể tham gia lại cho đến khi ván mới bắt đầu."
        title="Rời khỏi trận đấu?"
        @cancel="cancelQuit"
        @confirm="quitGame"
      )
</template>

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
useKittenSound({ state });

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

/**
 * The same guard as a value, so the template can pass the interaction without a
 * non-null assertion — TS syntax inside a pug template is not compiled away.
 */
const deckPositionInteraction = computed(() =>
    showDeckPositionModal.value ? (state.value?.interaction ?? null) : null,
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

<style scoped lang="scss">
  /*
   * The room page paints no background of its own — the cream field comes from
   * `layouts/default.vue`. Everything here is layout plus the few surfaces the
   * table needs on top of that field.
   */
  .room {
    position: relative;
    max-width: 1400px;
    margin: 0 auto;
    padding: 0.85rem 1.25rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;

    // The shared header, given the room's own pill ground.
    &__header {
      padding: 0.5rem 0.9rem;
      border-radius: 999px;
      background: $cream-card;
      border: $outline-width solid $ink;
      box-shadow: $shadow-sm;
    }

    &__title {
      display: flex;
      flex-direction: column;
      gap: 0.05rem;
      min-width: 0;
    }

    &__name {
      font-family: $font-display;
      font-size: 1.1rem;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: $ink;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__id {
      font-size: 0.78rem;
      color: $ink-dim;
    }

    /* Autoplay was blocked; one click on this wakes every remote audio element. */
    &__gesture-prompt {
      display: block;
      width: 100%;
      text-align: center;
      cursor: pointer;
    }

    &__notice,
    &__banner {
      margin: 0;
    }

    &__banner {
      font-weight: 600;
    }
  }

  /* ------------------------------------------------------- pre-game lobby */

  .lobby {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    &__content {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;

      @include respond-to("lg") {
        flex-direction: row;
        gap: 2rem;
      }
    }

    &__col {
      flex: 1;
      min-width: 0;

      &--settings {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
    }

    &__heading {
      color: $ink;
    }

    &__seats {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0.9rem;
      width: 100%;
      padding: 0.5rem 0;
    }

    &__seat {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
    }

    &__conn {
      flex: none;
      padding: 0.25rem 0.6rem;
      border: 1.5px solid;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.3px;
      white-space: nowrap;

      &--online {
        color: $good;
        border-color: $good;
      }

      &--offline {
        color: $bad;
        border-color: $bad;
      }
    }

    &__actions {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    &__start {
      display: flex;
      justify-content: center;
      margin: 1.5rem 0 0.5rem;
    }

    &__kick {
      flex: none;
    }
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

    &__arc {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: flex-start;
      gap: 0.5rem 1.4rem;
      padding-top: 0.5rem;
      min-height: 132px;
    }

    &__center {
      grid-column: 1 / 3;
      display: grid;
      place-items: center;
    }

    &__banner {
      grid-column: 3;
      display: flex;
      justify-content: center;
      align-self: start;
      padding-top: 0.5rem;
    }

    &__self {
      grid-column: 1;
      display: grid;
      place-items: center;
      align-self: end;
    }

    &__hand {
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

      /* The drop target for a draw. Same warm accent as the deck's own glow,
         so it reads as "this is where that card goes". */
      &--drop-active {
        border-color: rgb(255 194 26 / 70%);
        background: rgb(255 194 26 / 8%);
        box-shadow: inset 0 0 34px rgb(255 140 40 / 30%);
      }
    }

    &__watching {
      margin: 0 0 1.5rem;
      color: $ink-dim;
      text-align: center;
    }

    /* The Nope window is urgent, so it floats over the piles. */
    &__nope {
      position: absolute;
      left: 50%;
      top: 46%;
      transform: translate(-50%, -50%);
      width: min(680px, 82%);
      z-index: 8;
    }

    &__curtain {
      position: absolute;
      inset: 0;
      z-index: 12;
      display: grid;
      place-items: center;
      border-radius: 26px;
      background: rgb(249 237 212 / 82%);
      backdrop-filter: blur(2px);
    }

    &__result {
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      align-items: center;
      padding: 1.6rem 2.2rem;

      h2 {
        font-size: 2rem;
      }
    }

    &__result-seats {
      display: flex;
      flex-wrap: wrap;
      gap: 0.9rem;
      justify-content: center;
      padding: 0.5rem 0;
    }
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
    opacity: 0.85;
    transition: opacity 0.2s ease;

    &:hover,
    &:focus-within,
    &--open {
      opacity: 1;
    }

    &__toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-family: $font-display;
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.5px;
      padding: 0.45rem 1rem;
      background: $cream-card;
      color: $ink;
      border: $outline-width solid $ink;
      border-radius: 999px;
      box-shadow: $shadow-sm;
      cursor: pointer;
      transition:
        filter 0.15s ease,
        transform 0.08s ease;

      &:hover {
        filter: brightness(1.04);
      }

      &:active {
        transform: translateY(2px);
        box-shadow: 0 1px 0 $ink;
      }
    }
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
