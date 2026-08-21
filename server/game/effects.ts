import {
    type Card,
    type CardId,
    type ComboKind,
    type GameState,
    type InteractionKind,
    type PendingInteraction,
} from "#shared/types/game";
import { nextInt, shuffle } from "./rng";
import {
    endTurn,
    logEvent,
    nextAliveSeat,
    playerById,
    playerBySeat,
    skipEliminatedCurrent,
} from "./turn";

/**
 * The complete set of state mutations in the game. Card definitions return
 * these as data and never touch state themselves, which keeps every card pure
 * and testable — and means a new mechanic is one new variant plus one case
 * below, with the turn loop untouched.
 */
export type Effect =
    | { t: "DRAW"; playerId: string; from: "top" | "bottom" }
    | { t: "STEAL_RANDOM"; fromPlayerId: string; toPlayerId: string }
    | {
          t: "MOVE_CARD";
          uid: string;
          fromPlayerId: string;
          toPlayerId: string;
          reason: "favor" | "demand";
      }
    | { t: "DEMAND"; fromPlayerId: string; toPlayerId: string; cardId: CardId }
    | { t: "TAKE_FROM_DISCARD"; playerId: string; uid: string }
    | { t: "SHUFFLE_DRAW" }
    | { t: "SET_DRAW_TOP"; uids: string[] }
    | { t: "INSERT_FROM_LIMBO"; uid: string; index: number }
    | { t: "PEEK"; playerId: string; count: number }
    | { t: "CLEAR_PEEKS" }
    | { t: "END_TURN" }
    | { t: "PASS_TURNS"; toPlayerId: string | null; turns: number }
    | { t: "SET_TURNS"; turns: number }
    | { t: "REVERSE" }
    | { t: "ELIMINATE"; playerId: string }
    | {
          t: "REQUEST_INTERACTION";
          interaction: Omit<
              PendingInteraction,
              "id" | "responses" | "deadline"
          >;
          timeoutMs?: number;
      }
    | { t: "GARBAGE_COLLECT"; starterId: string }
    | {
          t: "GARBAGE_REDISTRIBUTE";
          starterId: string;
          picks: Array<{ playerId: string; uid: string }>;
      }
    | {
          t: "LOG";
          type: Parameters<typeof logEvent>[1]["type"];
          playerId?: string;
          targetId?: string;
          cardId?: CardId;
          count?: number;
          combo?: ComboKind;
      };

export interface EffectEnv {
    now: number;
    interactionTimeoutMs: number;
    /** Monotonic id source for interactions; injected so the engine stays pure. */
    nextId: () => string;
}

function removeFromHand(
    state: GameState,
    playerId: string,
    uid: string,
): Card | undefined {
    const player = playerById(state, playerId);
    if (!player) return undefined;
    const index = player.hand.findIndex((c) => c.uid === uid);
    if (index === -1) return undefined;
    return player.hand.splice(index, 1)[0];
}

export function applyEffects(
    state: GameState,
    effects: Effect[],
    env: EffectEnv,
): void {
    for (const effect of effects) applyEffect(state, effect, env);
}

export function applyEffect(
    state: GameState,
    effect: Effect,
    env: EffectEnv,
): void {
    const { now } = env;

    switch (effect.t) {
        case "DRAW": {
            const player = playerById(state, effect.playerId);
            if (!player) return;
            const card =
                effect.from === "top"
                    ? state.drawPile.shift()
                    : state.drawPile.pop();
            if (!card) return;
            // Peeked knowledge is stale the moment the top of the deck changes.
            if (effect.from === "top") {
                for (const pid of Object.keys(state.peeks)) {
                    state.peeks[pid] = state.peeks[pid]!.slice(1);
                }
            }

            if (card.id === "exploding-kitten") {
                state.limbo.push(card);
                logEvent(
                    state,
                    {
                        type: "kitten-drawn",
                        playerId: player.id,
                        cardId: card.id,
                    },
                    now,
                );
                const defuse = player.hand.find((c) => c.id === "defuse");
                if (defuse) {
                    // Defuse is mandatory, so it is spent here rather than played as a card.
                    removeFromHand(state, player.id, defuse.uid);
                    state.discardPile.unshift(defuse);
                    logEvent(
                        state,
                        {
                            type: "kitten-defused",
                            playerId: player.id,
                            cardId: "defuse",
                        },
                        now,
                    );
                    applyEffect(
                        state,
                        {
                            t: "REQUEST_INTERACTION",
                            interaction: {
                                kind: "choose-deck-position",
                                cardId: "defuse",
                                requiredFrom: [player.id],
                                context: {
                                    kittenUid: card.uid,
                                    endTurnAfter: true,
                                },
                                maxPosition: state.drawPile.length,
                            },
                        },
                        env,
                    );
                } else {
                    // Exploding ends the player's turns outright; ELIMINATE moves play on.
                    applyEffect(
                        state,
                        { t: "ELIMINATE", playerId: player.id },
                        env,
                    );
                }
                return;
            }

            player.hand.push(card);
            logEvent(
                state,
                {
                    type: "card-drawn",
                    playerId: player.id,
                },
                now,
            );
            endTurnAfterDraw(state, now);
            return;
        }

        case "STEAL_RANDOM": {
            const from = playerById(state, effect.fromPlayerId);
            const to = playerById(state, effect.toPlayerId);
            if (!from || !to || !from.hand.length) return;
            const card = from.hand.splice(
                nextInt(state, from.hand.length),
                1,
            )[0]!;
            to.hand.push(card);
            logEvent(
                state,
                {
                    type: "card-stolen",
                    playerId: to.id,
                    targetId: from.id,
                },
                now,
            );
            return;
        }

        case "MOVE_CARD": {
            const card = removeFromHand(state, effect.fromPlayerId, effect.uid);
            const to = playerById(state, effect.toPlayerId);
            if (!card || !to) return;
            to.hand.push(card);
            logEvent(
                state,
                {
                    type:
                        effect.reason === "favor"
                            ? "card-given"
                            : "card-demanded",
                    playerId: effect.fromPlayerId,
                    targetId: effect.toPlayerId,
                    cardId: card.id,
                },
                now,
            );
            return;
        }

        case "DEMAND": {
            const from = playerById(state, effect.fromPlayerId);
            const to = playerById(state, effect.toPlayerId);
            if (!from || !to) return;
            const held = from.hand.find((c) => c.id === effect.cardId);
            if (!held) {
                logEvent(
                    state,
                    {
                        type: "card-demand-failed",
                        playerId: from.id,
                        targetId: to.id,
                        cardId: effect.cardId,
                    },
                    now,
                );
                return;
            }
            applyEffect(
                state,
                {
                    t: "MOVE_CARD",
                    uid: held.uid,
                    fromPlayerId: from.id,
                    toPlayerId: to.id,
                    reason: "demand",
                },
                env,
            );
            return;
        }

        case "TAKE_FROM_DISCARD": {
            const player = playerById(state, effect.playerId);
            if (!player) return;
            const index = state.discardPile.findIndex(
                (c) => c.uid === effect.uid,
            );
            if (index === -1) return;
            const card = state.discardPile.splice(index, 1)[0]!;
            player.hand.push(card);
            logEvent(
                state,
                {
                    type: "card-taken-from-discard",
                    playerId: player.id,
                    cardId: card.id,
                },
                now,
            );
            return;
        }

        case "SHUFFLE_DRAW": {
            shuffle(state, state.drawPile);
            state.peeks = {};
            logEvent(
                state,
                {
                    type: "deck-shuffled",
                },
                now,
            );
            return;
        }

        case "SET_DRAW_TOP": {
            const wanted = effect.uids;
            const picked: Card[] = [];
            for (const uid of wanted) {
                const index = state.drawPile.findIndex((c) => c.uid === uid);
                if (index !== -1)
                    picked.push(state.drawPile.splice(index, 1)[0]!);
            }
            state.drawPile.unshift(...picked);
            state.peeks = {};
            logEvent(
                state,
                {
                    type: "future-altered",
                    count: picked.length,
                },
                now,
            );
            return;
        }

        case "INSERT_FROM_LIMBO": {
            const index = state.limbo.findIndex((c) => c.uid === effect.uid);
            if (index === -1) return;
            const card = state.limbo.splice(index, 1)[0]!;
            const at = Math.max(
                0,
                Math.min(effect.index, state.drawPile.length),
            );
            state.drawPile.splice(at, 0, card);
            state.peeks = {};
            return;
        }

        case "PEEK": {
            state.peeks[effect.playerId] = state.drawPile
                .slice(0, effect.count)
                .map((c) => ({ ...c }));
            logEvent(
                state,
                {
                    type: "future-seen",
                    playerId: effect.playerId,
                    count: Math.min(effect.count, state.drawPile.length),
                },
                now,
            );
            return;
        }

        case "CLEAR_PEEKS":
            state.peeks = {};
            return;

        case "END_TURN": {
            endTurn(state);
            afterTurnChange(state, now);
            return;
        }

        case "PASS_TURNS": {
            const target = effect.toPlayerId
                ? playerById(state, effect.toPlayerId)
                : playerBySeat(
                      state,
                      nextAliveSeat(
                          state,
                          state.turn.seat,
                          state.turn.direction,
                      ),
                  );
            if (!target || !target.alive) return;
            state.turn.seat = target.seat;
            state.turn.turnsRemaining = Math.max(1, effect.turns);
            logEvent(
                state,
                {
                    type: "player-attacked",
                    targetId: target.id,
                    count: state.turn.turnsRemaining,
                },
                now,
            );
            afterTurnChange(state, now);
            return;
        }

        case "SET_TURNS": {
            state.turn.turnsRemaining = Math.max(1, effect.turns);
            afterTurnChange(state, now);
            return;
        }

        case "REVERSE": {
            state.turn.direction = state.turn.direction === 1 ? -1 : 1;
            logEvent(
                state,
                {
                    type: "direction-reversed",
                },
                now,
            );
            return;
        }

        case "ELIMINATE": {
            const player = playerById(state, effect.playerId);
            if (!player || !player.alive) return;
            player.alive = false;
            // Their hand (and the kitten that got them) goes to the discard pile.
            state.discardPile.unshift(...player.hand.splice(0));
            const kitten = state.limbo.findIndex(
                (c) => c.id === "exploding-kitten",
            );
            if (kitten !== -1)
                state.discardPile.unshift(...state.limbo.splice(kitten, 1));
            delete state.peeks[player.id];
            logEvent(
                state,
                {
                    type: "player-exploded",
                    playerId: player.id,
                },
                now,
            );
            checkGameOver(state, now);
            // If they were mid-turn (or mid-attack), those turns die with them.
            if (state.status === "playing" && state.turn.seat === player.seat) {
                skipEliminatedCurrent(state);
                afterTurnChange(state, now);
            }
            return;
        }

        case "REQUEST_INTERACTION": {
            state.interaction = {
                ...effect.interaction,
                id: env.nextId(),
                responses: {},
                deadline: now + (effect.timeoutMs ?? env.interactionTimeoutMs),
            };
            return;
        }

        case "GARBAGE_COLLECT": {
            const contributors = state.players.filter(
                (p) => p.alive && p.hand.length > 0,
            );
            applyEffect(
                state,
                {
                    t: "REQUEST_INTERACTION",
                    timeoutMs: 10000,
                    interaction: {
                        kind: "simultaneous-choose-card",
                        cardId: "garbage-collection",
                        requiredFrom: contributors.map((p) => p.id),
                        context: { starterId: effect.starterId },
                    },
                },
                env,
            );
            return;
        }

        case "GARBAGE_REDISTRIBUTE": {
            const pile: Card[] = [];
            for (const p of effect.picks) {
                const card = removeFromHand(state, p.playerId, p.uid);
                if (card) pile.push(card);
            }
            if (!pile.length) return;

            // Mix the collected cards into the draw pile and reshuffle the whole deck.
            state.drawPile.push(...pile);
            shuffle(state, state.drawPile);
            state.peeks = {}; // deck order changed — every See-the-Future peek is stale

            // Deal one card back to each contributor, starting with the player who
            // played the card. Exploding Kittens are never handed out — they only
            // reach a hand through the draw + defuse path — so we take the topmost
            // card that isn't one and leave the kittens in the deck.
            const contributors = effect.picks
                .map((p) => playerById(state, p.playerId))
                .filter(
                    (p): p is NonNullable<typeof p> => Boolean(p) && p!.alive,
                );
            if (!contributors.length) return;
            const startIndex = Math.max(
                0,
                contributors.findIndex((p) => p.id === effect.starterId),
            );
            const dealCount = pile.length;
            for (let i = 0; i < dealCount; i++) {
                const receiver =
                    contributors[(startIndex + i) % contributors.length];
                const index = state.drawPile.findIndex(
                    (c) => c.id !== "exploding-kitten",
                );
                if (index === -1) break; // nothing but kittens left — no safe card to deal
                const card = state.drawPile.splice(index, 1)[0];
                if (receiver && card) receiver.hand.push(card);
            }
            // The kittens we skipped would otherwise sit stacked on top of the deck
            // and blow up whoever draws next, so scatter them again.
            shuffle(state, state.drawPile);
            logEvent(
                state,
                {
                    type: "garbage-collected",
                    playerId: effect.starterId,
                    count: dealCount,
                },
                now,
            );
            return;
        }

        case "LOG": {
            logEvent(
                state,
                {
                    type: effect.type,
                    playerId: effect.playerId,
                    targetId: effect.targetId,
                    cardId: effect.cardId,
                    count: effect.count,
                    combo: effect.combo,
                },
                now,
            );
            return;
        }
    }
}

/**
 * A draw always ends the turn — unless a Defuse prompt is now pending, in
 * which case the turn ends once the kitten has been put back. Never called on
 * the explode path: ELIMINATE hands play on by itself.
 */
function endTurnAfterDraw(state: GameState, now: number): void {
    if (state.interaction) return;
    if (state.status !== "playing") return;
    endTurn(state);
    afterTurnChange(state, now);
}

function afterTurnChange(state: GameState, now: number): void {
    if (state.status !== "playing") return;
    skipEliminatedCurrent(state);
    const player = playerBySeat(state, state.turn.seat);
    if (player) {
        logEvent(
            state,
            {
                type: "turn-changed",
                playerId: player.id,
                count: state.turn.turnsRemaining,
            },
            now,
        );
    }
}

export function checkGameOver(state: GameState, now: number): void {
    const alive = state.players.filter((p) => p.alive);
    if (alive.length > 1 || state.status !== "playing") return;
    state.status = "over";
    state.winnerId = alive[0]?.id ?? null;
    state.turnDeadline = null;
    state.nopeWindow = null;
    state.actionStack = [];
    state.interaction = null;
    logEvent(
        state,
        {
            type: "game-over",
            playerId: state.winnerId ?? undefined,
        },
        now,
    );
}
