// @vitest-environment nuxt
import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { GameEvent, PublicGameState } from "#shared/types/game";
import { useTurnSound } from "./index";

const event = (seq: number, type: GameEvent["type"], playerId: string): GameEvent => ({
  seq,
  at: seq * 1000,
  type,
  playerId,
  message: "",
});

function snapshot(overrides: Partial<PublicGameState> = {}): PublicGameState {
  return {
    roomId: "ABCD",
    status: "playing",
    players: [
      { id: "p1", nickname: "Whiskers", avatarId: "art_02", seat: 0, handCount: 2, alive: true, connected: true, ready: false },
      { id: "p2", nickname: "Mittens", avatarId: "art_03", seat: 1, handCount: 4, alive: true, connected: true, ready: false },
    ],
    drawCount: 10,
    discardTop: null,
    discardCount: 0,
    discardPile: [],
    turn: { seat: 0, direction: 1, turnsRemaining: 1 },
    currentPlayerId: "p1",
    actionStack: [],
    nopeWindow: null,
    interaction: null,
    turnDeadline: null,
    winnerId: null,
    you: { id: "p1", hand: [], peek: null, isHost: true },
    log: [],
    ...overrides,
  } as PublicGameState;
}

function setup() {
  const state = ref<PublicGameState | null>(null);
  const play = vi.fn();
  const scope = effectScope();
  scope.run(() => useTurnSound({ state, youId: () => "p1", play }));
  return { state, play, scope };
}

/** Applies a snapshot the way the socket would, and lets the watcher run. */
async function push(state: ReturnType<typeof setup>["state"], next: PublicGameState) {
  state.value = next;
  await nextTick();
}

describe("useTurnSound", () => {
  it("treats the first snapshot as history, not news", async () => {
    // A reconnect that lands mid-your-turn must not blast the cue.
    const { state, play } = setup();
    await push(state, snapshot({ currentPlayerId: "p1", log: [event(4, "turn-changed", "p1")] }));

    expect(play).not.toHaveBeenCalled();
  });

  it("plays when a fresh turn-changed event names you", async () => {
    const { state, play } = setup();
    await push(state, snapshot({ currentPlayerId: "p2", log: [event(1, "game-started", "p1")] }));
    await push(
      state,
      snapshot({
        currentPlayerId: "p1",
        log: [event(1, "game-started", "p1"), event(2, "turn-changed", "p1")],
      }),
    );

    expect(play).toHaveBeenCalledTimes(1);
  });

  it("does not play for someone else's turn", async () => {
    const { state, play } = setup();
    await push(state, snapshot({ currentPlayerId: "p1", log: [event(1, "game-started", "p1")] }));
    await push(
      state,
      snapshot({
        currentPlayerId: "p2",
        log: [event(1, "game-started", "p1"), event(2, "turn-changed", "p2")],
      }),
    );

    expect(play).not.toHaveBeenCalled();
  });

  it("does not replay on later snapshots while it stays your turn", async () => {
    const { state, play } = setup();
    await push(state, snapshot({ currentPlayerId: "p1", log: [event(1, "game-started", "p1")] }));
    await push(
      state,
      snapshot({
        currentPlayerId: "p1",
        log: [event(1, "game-started", "p1"), event(2, "turn-changed", "p1")],
      }),
    );
    expect(play).toHaveBeenCalledTimes(1);

    // A new snapshot from an unrelated event (e.g. a Nope resolving) while
    // it is still your turn should not replay the cue.
    await push(
      state,
      snapshot({
        currentPlayerId: "p1",
        log: [
          event(1, "game-started", "p1"),
          event(2, "turn-changed", "p1"),
          event(3, "action-noped", "p2"),
        ],
      }),
    );

    expect(play).toHaveBeenCalledTimes(1);
  });
});
