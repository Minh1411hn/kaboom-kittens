import {
    HAND_SIZE,
    STATE_VERSION,
    type Card,
    type Command,
    type DeckOverrides,
    type GameEvent,
    type GameState,
    type InteractionKind,
    type InteractionResponse,
    type PendingAction,
} from "#shared/types/game";
import type { Rejection } from "#shared/types/errors";
import { registerAllCards } from "./cards";
import { resolveComboInteraction, validateCombo } from "./cards/cats";
import {
    buildDealPile,
    finishDeck,
    makeCard,
    MAX_PLAYERS,
    MIN_PLAYERS,
    validateDealable,
    validateDeckOverrides,
} from "./deck";
import {
    applyEffects,
    checkGameOver,
    type Effect,
    type EffectEnv,
} from "./effects";
import { eligibleNopers, resolveActionStack, windowCanCloseNow } from "./nope";
import { getCardDefinition } from "./registry";
import { createSeed, nextInt, pick, shuffle } from "./rng";
import {
    currentPlayer,
    logEvent,
    playerById,
    skipEliminatedCurrent,
} from "./turn";

registerAllCards();

export interface EngineConfig {
    nopeWindowMs: number;
    turnTimeoutMs: number;
    interactionTimeoutMs: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
    nopeWindowMs: 5000,
    turnTimeoutMs: 45000,
    interactionTimeoutMs: 10000,
};

export interface ReduceResult {
    state: GameState;
    /** Events appended by this command, for animation on the client. */
    events: GameEvent[];
    /** Set when the command was rejected; state is returned unchanged. */
    error?: Rejection;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function createGame(roomId: string, seed = createSeed()): GameState {
    return {
        version: STATE_VERSION,
        roomId,
        status: "lobby",
        seed,
        rngState: seed,
        deckOverrides: {},
        players: [],
        drawPile: [],
        discardPile: [],
        turn: { seat: 0, direction: 1, turnsRemaining: 1 },
        actionStack: [],
        nopeWindow: null,
        interaction: null,
        peeks: {},
        limbo: [],
        turnDeadline: null,
        winnerId: null,
        eventSeq: 0,
        log: [],
    };
}

export function addPlayer(
    state: GameState,
    id: string,
    nickname: string,
    avatarId: string,
): Rejection | null {
    if (state.players.some((p) => p.id === id)) return null;
    if (state.status !== "lobby") return { code: "game-already-started" };
    if (state.players.length >= MAX_PLAYERS)
        return { code: "room-full", params: { max: MAX_PLAYERS } };
    state.players.push({
        id,
        nickname,
        avatarId,
        seat: state.players.length,
        hand: [],
        alive: true,
        connected: true,
        disconnectedAt: null,
        ready: false,
    });
    return null;
}

export function removePlayer(state: GameState, id: string): void {
    // No game is in progress in either state, so the seat can go outright — and
    // `over` counts as waiting: whoever leaves the end-of-game screen is gone.
    if (state.status === "lobby" || state.status === "over") {
        state.players = state.players.filter((p) => p.id !== id);
        state.players.forEach((p, index) => (p.seat = index));
        return;
    }
    // Mid-game a leaver is eliminated rather than removed, so seats stay stable.
    const player = playerById(state, id);
    if (player?.alive) {
        player.alive = false;
        player.connected = false;
        state.discardPile.unshift(...player.hand.splice(0));
    }
}

export function setConnected(
    state: GameState,
    id: string,
    connected: boolean,
    now: number,
): void {
    const player = playerById(state, id);
    if (!player) return;
    player.connected = connected;
    player.disconnectedAt = connected ? null : now;

    if (!connected && state.status === "over") {
        const remaining = state.players.filter((p) => p.connected);
        if (remaining.length && remaining.every((p) => p.ready)) {
            resetToLobby(state, now);
        }
    }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reduce(
    input: GameState,
    command: Command,
    config: EngineConfig = DEFAULT_CONFIG,
): ReduceResult {
    const state = structuredClone(input);
    const before = state.eventSeq;
    // Ids are derived from state so a replay produces byte-identical output.
    let idSeq = 0;
    const env: EffectEnv = {
        now: command.now,
        interactionTimeoutMs: config.interactionTimeoutMs,
        nextId: () => `i${state.eventSeq}-${(idSeq += 1)}`,
    };

    const error = dispatch(state, command, config, env);
    if (error) return { state: input, events: [], error };

    settle(state, config, env);
    return { state, events: state.log.filter((e) => e.seq > before) };
}

function dispatch(
    state: GameState,
    command: Command,
    config: EngineConfig,
    env: EffectEnv,
): Rejection | undefined {
    switch (command.type) {
        case "start-game":
            return startGame(state, command.now, config);

        case "set-deck-overrides":
            return setDeckOverrides(state, command.overrides);

        case "play-card":
            return playCard(state, command, config, env);

        case "draw-card": {
            if (state.status !== "playing")
                return { code: "game-not-started" };
            if (state.interaction)
                return { code: "interaction-in-progress" };
            if (state.nopeWindow) return { code: "nope-window-open" };
            const player = currentPlayer(state);
            if (!player || player.id !== command.playerId)
                return { code: "not-your-turn" };
            applyEffects(
                state,
                [{ t: "DRAW", playerId: player.id, from: "top" }],
                env,
            );
            return undefined;
        }

        case "pass-nope": {
            if (!state.nopeWindow) return { code: "no-nope-window" };
            if (!state.nopeWindow.passed.includes(command.playerId)) {
                state.nopeWindow.passed.push(command.playerId);
            }
            if (windowCanCloseNow(state)) resolveActionStack(state, env);
            return undefined;
        }

        case "close-nope-window": {
            if (!state.nopeWindow) return undefined;
            resolveActionStack(state, env);
            return undefined;
        }

        case "submit-interaction":
            return submitInteraction(state, command, env);

        case "timeout-turn": {
            if (
                state.status !== "playing" ||
                state.interaction ||
                state.nopeWindow
            )
                return undefined;
            const player = currentPlayer(state);
            if (!player) return undefined;
            // The DRAW effect below logs its own "card-drawn" event — no need
            // for a second one here just to note the timeout triggered it.
            applyEffects(
                state,
                [{ t: "DRAW", playerId: player.id, from: "top" }],
                env,
            );
            return undefined;
        }

        case "timeout-interaction": {
            if (!state.interaction) return undefined;
            autoAnswerInteraction(state);
            return completeInteractionIfReady(state, env, true);
        }

        case "quit-game": {
            if (state.status !== "playing")
                return { code: "game-not-started" };
            const player = playerById(state, command.playerId);
            if (!player) return { code: "not-in-game" };
            if (!player.alive) return { code: "already-left" };
            // No interaction/nopeWindow guard here, unlike draw-card — a player
            // quitting should go through even mid-prompt or mid-Nope-window.
            removePlayer(state, command.playerId);
            logEvent(
                state,
                {
                    type: "player-quit",
                    playerId: command.playerId,
                },
                env.now,
            );
            // settle() below re-runs both of these, but only this explicit call
            // produces the "quit the game" log line above.
            skipEliminatedCurrent(state);
            checkGameOver(state, env.now);
            return undefined;
        }

        case "return-to-lobby": {
            if (state.status !== "over") return { code: "game-not-over" };
            const player = playerById(state, command.playerId);
            if (!player) return { code: "not-in-game" };
            player.ready = true;
            const connected = state.players.filter((p) => p.connected);
            if (connected.length && connected.every((p) => p.ready)) {
                resetToLobby(state, env.now);
            }
            return undefined;
        }
    }
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

/**
 * Host-only in practice — `_ws.ts` checks host identity before this ever runs,
 * since the host lives in `RoomMeta` and the engine cannot see it. Kept as an
 * engine command rather than a `mutateRoom` callback because the deck config
 * decides the deal, so it has to be in the command log for a replay to match.
 */
function setDeckOverrides(
    state: GameState,
    overrides: DeckOverrides,
): Rejection | undefined {
    if (state.status !== "lobby") return { code: "not-in-lobby" };
    const error = validateDeckOverrides(overrides);
    if (error) return error;
    const next: DeckOverrides = {};
    for (const [id, count] of Object.entries(overrides)) {
        if (count != null) next[id as keyof DeckOverrides] = count;
    }
    state.deckOverrides = next;
    return undefined;
}

function startGame(
    state: GameState,
    now: number,
    config: EngineConfig,
): Rejection | undefined {
    if (state.status !== "lobby") return { code: "game-already-started" };
    if (state.players.length < MIN_PLAYERS)
        return { code: "min-players", params: { min: MIN_PLAYERS } };

    const playerCount = state.players.length;
    const overrides = state.deckOverrides;
    const dealError = validateDealable(playerCount, overrides);
    if (dealError) return dealError;

    const pile = buildDealPile(state, playerCount, overrides);

    state.players.forEach((player, index) => {
        player.seat = index;
        player.alive = true;
        player.ready = false;
        player.hand = pile.splice(0, HAND_SIZE);
        player.hand.push(makeCard("defuse"));
    });

    state.drawPile = finishDeck(
        state,
        pile,
        playerCount,
        playerCount,
        overrides,
    );
    state.discardPile = [];
    state.limbo = [];
    state.peeks = {};
    state.actionStack = [];
    state.nopeWindow = null;
    state.interaction = null;
    state.winnerId = null;
    state.status = "playing";
    // Random starting seat so the room host has no built-in advantage.
    state.turn = {
        seat: nextInt(state, playerCount),
        direction: 1,
        turnsRemaining: 1,
    };
    state.turnDeadline = now + config.turnTimeoutMs;

    logEvent(
        state,
        {
            type: "game-started",
            count: playerCount,
        },
        now,
    );
    const first = currentPlayer(state);
    if (first) {
        logEvent(
            state,
            {
                type: "turn-changed",
                playerId: first.id,
            },
            now,
        );
    }
    return undefined;
}

/**
 * Resets a finished game back to the waiting room, keeping the same roster/seats.
 * `deckOverrides` is deliberately left alone — the host configures the deck once
 * and it holds for every game played in the room.
 */
export function resetToLobby(state: GameState, now: number): void {
    state.status = "lobby";
    state.drawPile = [];
    state.discardPile = [];
    state.turn = { seat: 0, direction: 1, turnsRemaining: 1 };
    state.actionStack = [];
    state.nopeWindow = null;
    state.interaction = null;
    state.peeks = {};
    state.limbo = [];
    state.turnDeadline = null;
    state.winnerId = null;
    state.players.forEach((p) => {
        p.hand = [];
        p.alive = true;
        p.ready = false;
        // id, nickname, seat, connected, disconnectedAt kept — same roster, same seats.
    });
    logEvent(
        state,
        {
            type: "returned-to-lobby",
        },
        now,
    );
}

function playCard(
    state: GameState,
    command: Extract<Command, { type: "play-card" }>,
    config: EngineConfig,
    env: EffectEnv,
): Rejection | undefined {
    if (state.status !== "playing") return { code: "game-not-started" };
    if (state.interaction) return { code: "interaction-in-progress" };

    const player = playerById(state, command.playerId);
    if (!player) return { code: "not-in-game" };
    if (!player.alive) return { code: "you-are-eliminated" };
    if (!command.uids.length) return { code: "no-cards-selected" };

    const cards = command.uids.map((uid) =>
        player.hand.find((c) => c.uid === uid),
    );
    if (cards.some((c) => !c)) return { code: "not-your-cards" };
    const played = cards as Card[];
    const ids = played.map((c) => c.id);
    const leadId = ids[0]!;
    const action = buildAction(state, command, played);

    if (command.combo) {
        if (state.nopeWindow) return { code: "nope-window-open" };
        if (currentPlayer(state)?.id !== player.id)
            return { code: "not-your-turn" };
        const valid = validateCombo(
            command.combo,
            ids,
            state,
            player,
            command.targetPlayerId ?? null,
            command.namedCardId ?? null,
        );
        if (valid !== true) return valid;
    } else {
        if (played.length !== 1) return { code: "invalid-play-count" };
        const definition = getCardDefinition(leadId);
        if (definition.playWindow === "own-turn") {
            if (state.nopeWindow) return { code: "nope-window-open" };
            if (currentPlayer(state)?.id !== player.id)
                return { code: "not-your-turn" };
        }
        if (definition.requiresTarget && !command.targetPlayerId)
            return { code: "target-required" };

        const allowed = definition.canPlay?.({ state, player, action });
        if (allowed !== undefined && allowed !== true) return allowed;
    }

    // The cards are spent now — a Noped card is still discarded.
    for (const card of played) {
        player.hand.splice(
            player.hand.findIndex((c) => c.uid === card.uid),
            1,
        );
        state.discardPile.unshift(card);
    }

    if (leadId === "nope") {
        state.actionStack.push(action);
        logEvent(
            state,
            {
                type: "card-played",
                playerId: player.id,
                cardId: "nope",
            },
            env.now,
        );
        openOrCloseWindow(state, config, env);
        return undefined;
    }

    state.actionStack = [action];
    logEvent(
        state,
        command.combo
            ? {
                  type: "combo-played",
                  playerId: player.id,
                  targetId: command.targetPlayerId,
                  cardIds: ids,
                  combo: command.combo,
              }
            : {
                  type: "card-played",
                  playerId: player.id,
                  targetId: command.targetPlayerId,
                  cardId: leadId,
              },
        env.now,
    );
    openOrCloseWindow(state, config, env);
    return undefined;
}

function buildAction(
    state: GameState,
    command: Extract<Command, { type: "play-card" }>,
    played: Card[],
): PendingAction {
    const leadId = played[0]!.id;
    return {
        id: `a${state.eventSeq}-${leadId}`,
        playerId: command.playerId,
        cardId: leadId,
        cardUids: played.map((c) => c.uid),
        combo: command.combo,
        targetPlayerId: command.targetPlayerId ?? null,
        namedCardId: command.namedCardId ?? null,
        nopeable: command.combo ? true : getCardDefinition(leadId).nopeable,
    };
}

/** Open a Nope window, unless nobody could Nope — then resolve immediately. */
function openOrCloseWindow(
    state: GameState,
    config: EngineConfig,
    env: EffectEnv,
): void {
    const top = state.actionStack[state.actionStack.length - 1];
    if (!top) return;
    if (!top.nopeable || eligibleNopers(state).length === 0) {
        resolveActionStack(state, env);
        return;
    }
    state.nopeWindow = { deadline: env.now + config.nopeWindowMs, passed: [] };
}

function submitInteraction(
    state: GameState,
    command: Extract<Command, { type: "submit-interaction" }>,
    env: EffectEnv,
): Rejection | undefined {
    const interaction = state.interaction;
    if (!interaction) return { code: "no-interaction" };
    if (interaction.id !== command.interactionId)
        return { code: "interaction-completed" };
    if (!interaction.requiredFrom.includes(command.playerId))
        return { code: "not-your-interaction" };
    // Garbage Collection allows switching cards freely until the deadline;
    // every other interaction still refuses a second submission.
    if (
        interaction.responses[command.playerId] &&
        interaction.kind !== "simultaneous-choose-card"
    )
        return { code: "already-responded" };

    const invalid = validateResponse(
        state,
        command.playerId,
        command.response,
        interaction.kind,
    );
    if (invalid) return invalid;

    interaction.responses[command.playerId] = command.response;
    return completeInteractionIfReady(state, env);
}

function validateResponse(
    state: GameState,
    playerId: string,
    response: InteractionResponse,
    kind: InteractionKind,
): Rejection | undefined {
    const player = playerById(state, playerId);
    if (!player) return { code: "not-in-game" };

    if (kind === "simultaneous-choose-card") {
        if (response.type !== "card") return { code: "choose-a-card" };
        if (!player.hand.some((c) => c.uid === response.uid))
            return { code: "not-in-hand" };
        return undefined;
    }
    if (kind === "choose-card-from-hand") {
        if (response.type !== "card") return { code: "choose-a-card" };
        if (!player.hand.some((c) => c.uid === response.uid))
            return { code: "not-in-hand" };
        return undefined;
    }
    if (kind === "choose-from-discard") {
        if (response.type !== "card") return { code: "choose-a-card" };
        if (!state.discardPile.some((c) => c.uid === response.uid))
            return { code: "not-in-discard" };
        return undefined;
    }
    if (kind === "choose-deck-position") {
        if (response.type !== "position") return { code: "choose-a-position" };
        if (response.index < 0 || response.index > state.drawPile.length)
            return { code: "invalid-position" };
        return undefined;
    }
    if (kind === "reorder-cards") {
        if (response.type !== "order") return { code: "choose-an-order" };
        const expected = new Set(
            (state.interaction?.cards ?? []).map((c) => c.uid),
        );
        const got = new Set(response.uids);
        // Must be a permutation: same size, no duplicates, no invented uids.
        if (
            response.uids.length !== expected.size ||
            got.size !== expected.size ||
            response.uids.some((uid) => !expected.has(uid))
        ) {
            return { code: "invalid-order" };
        }
        return undefined;
    }
    return undefined;
}

/** Fills in defaults for anyone who did not answer before the deadline. */
function autoAnswerInteraction(state: GameState): void {
    const interaction = state.interaction;
    if (!interaction) return;
    for (const playerId of interaction.requiredFrom) {
        if (interaction.responses[playerId]) continue;
        const player = playerById(state, playerId);
        switch (interaction.kind) {
            case "choose-card-from-hand": {
                const card = player?.hand[0];
                if (card)
                    interaction.responses[playerId] = {
                        type: "card",
                        uid: card.uid,
                    };
                break;
            }
            case "simultaneous-choose-card": {
                // Nobody answered in time — the engine picks one of their cards at
                // random (seeded, so the game still replays byte-identically).
                const card = pick(state, player?.hand ?? []);
                if (card)
                    interaction.responses[playerId] = {
                        type: "card",
                        uid: card.uid,
                    };
                break;
            }
            case "choose-from-discard": {
                const card = state.discardPile[0];
                if (card)
                    interaction.responses[playerId] = {
                        type: "card",
                        uid: card.uid,
                    };
                break;
            }
            case "choose-deck-position":
                // Nothing chosen means the kitten goes back on top — the honest default.
                interaction.responses[playerId] = {
                    type: "position",
                    index: 0,
                };
                break;
            case "reorder-cards":
                interaction.responses[playerId] = {
                    type: "order",
                    uids: (interaction.cards ?? []).map((c) => c.uid),
                };
                break;
        }
    }
}

/**
 * `force` is set only by `timeout-interaction`. Garbage Collection runs its
 * full clock: everyone keeps the right to switch cards right up to the
 * deadline, so the last player answering must NOT end the prompt early.
 */
function completeInteractionIfReady(
    state: GameState,
    env: EffectEnv,
    force = false,
): Rejection | undefined {
    const interaction = state.interaction;
    if (!interaction) return undefined;
    if (!force && interaction.kind === "simultaneous-choose-card")
        return undefined;

    const stillWaiting = interaction.requiredFrom.filter((id) => {
        if (interaction.responses[id]) return false;
        // A player who exploded or has no cards can no longer answer.
        const player = playerById(state, id);
        return Boolean(player?.alive);
    });
    if (stillWaiting.length) return undefined;

    state.interaction = null;
    const effects: Effect[] = interaction.context.combo
        ? resolveComboInteraction({ state, interaction, now: env.now })
        : (getCardDefinition(interaction.cardId).onInteractionComplete?.({
              state,
              interaction,
              now: env.now,
          }) ?? []);

    applyEffects(state, effects, env);
    return undefined;
}

// ---------------------------------------------------------------------------
// Post-command housekeeping
// ---------------------------------------------------------------------------

function settle(state: GameState, config: EngineConfig, env: EffectEnv): void {
    if (state.status !== "playing") {
        state.turnDeadline = null;
        return;
    }

    checkGameOver(state, env.now);
    if (state.status !== "playing") return;

    // The current player may have exploded during this command.
    skipEliminatedCurrent(state);

    // Running out of cards to draw cannot happen (kittens keep the deck stocked),
    // but guard anyway so a malformed state cannot wedge the room.
    if (!state.drawPile.length && !state.interaction && !state.nopeWindow) {
        state.drawPile = shuffle(state, state.discardPile.splice(0));
    }

    // Prompts and Nope windows carry their own deadlines; the turn clock pauses.
    state.turnDeadline =
        state.interaction || state.nopeWindow
            ? null
            : env.now + config.turnTimeoutMs;
}

/** Next deadline the room scheduler should arm a timer for, if any. */
export function nextDeadline(
    state: GameState,
): { at: number; command: Command["type"] } | null {
    if (state.status !== "playing") return null;
    if (state.nopeWindow)
        return { at: state.nopeWindow.deadline, command: "close-nope-window" };
    if (state.interaction)
        return {
            at: state.interaction.deadline,
            command: "timeout-interaction",
        };
    if (state.turnDeadline)
        return { at: state.turnDeadline, command: "timeout-turn" };
    return null;
}
