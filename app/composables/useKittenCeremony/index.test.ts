// @vitest-environment nuxt
import { effectScope, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Card, GameEvent, PublicGameState } from "#shared/types/game";
import { useKittenCeremony, REVEAL_MS } from "./index";

/**
 * The ceremony is the only thing in the client that turns log events into
 * animation, and the one thing standing between a player and the dialog they
 * have to answer — so the tests care most about it always letting go.
 */

const card = (id: Card["id"], uid: string): Card => ({ id, uid });

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
    you: { id: "p1", hand: [card("skip", "h1"), card("defuse", "d1")], peek: null, isHost: true },
    log: [],
    ...overrides,
  } as PublicGameState;
}

function setup() {
  const state = ref<PublicGameState | null>(null);
  const captureRect = vi.fn(() => ({ left: 10, top: 20, width: 140, height: 195 }) as DOMRect);
  const scope = effectScope();
  const ceremony = scope.run(() =>
    useKittenCeremony({ state, youId: () => "p1", captureRect }),
  )!;
  return { state, ceremony, captureRect, scope };
}

/** Applies a snapshot the way the socket would, and lets the watcher run. */
async function push(state: ReturnType<typeof setup>["state"], next: PublicGameState) {
  state.value = next;
  await nextTick();
}

describe("useKittenCeremony", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("treats the first snapshot as history, not news", async () => {
    // A reconnect resets `seenSeq` and replays the whole log. Without this
    // guard every kitten the table ever drew would explode again on screen.
    const { state, ceremony } = setup();
    await push(state, snapshot({ log: [event(4, "kitten-drawn", "p2")] }));

    expect(ceremony.blocking.value).toBe(false);
    expect(ceremony.revealSeq.value).toBeNull();
  });

  it("reveals a kitten anyone draws, then lets go", async () => {
    const { state, ceremony } = setup();
    await push(state, snapshot({ log: [event(1, "game-started", "p1")] }));
    await push(
      state,
      snapshot({ log: [event(1, "game-started", "p1"), event(2, "kitten-drawn", "p2")] }),
    );

    expect(ceremony.phase.value).toBe("reveal");
    expect(ceremony.revealSeq.value).toBe(2);
    expect(ceremony.revealPlayerName.value).toBe("Mittens");
    // Someone else's Defuse is not yours to animate.
    expect(ceremony.holdLeave.value).toBe(false);
    expect(ceremony.blocking.value).toBe(true);

    vi.advanceTimersByTime(REVEAL_MS);
    expect(ceremony.phase.value).toBe("idle");
    expect(ceremony.blocking.value).toBe(false);
  });

  it("holds your Defuse in the fan, then flies it out, then releases", async () => {
    const { state, ceremony, captureRect } = setup();
    await push(state, snapshot({ log: [event(1, "game-started", "p1")] }));

    // The snapshot that carries both events also carries the hand without the
    // Defuse — the only place the client can learn which card was spent.
    await push(
      state,
      snapshot({
        you: { id: "p1", hand: [card("skip", "h1")], peek: null, isHost: true },
        log: [
          event(1, "game-started", "p1"),
          event(2, "kitten-drawn", "p1"),
          event(3, "kitten-defused", "p1"),
        ],
      }),
    );

    expect(ceremony.phase.value).toBe("reveal");
    expect(ceremony.holdLeave.value).toBe(true);
    expect(captureRect).toHaveBeenCalledWith("d1");
    expect(ceremony.defuseCard.value).toBeNull();

    vi.advanceTimersByTime(REVEAL_MS);
    expect(ceremony.phase.value).toBe("defuse");
    expect(ceremony.defuseCard.value?.uid).toBe("d1");
    // The flyer owns the card now, so the fan must let the slot go.
    expect(ceremony.holdLeave.value).toBe(false);
    expect(ceremony.blocking.value).toBe(true);

    ceremony.onDefuseFlightDone();
    expect(ceremony.phase.value).toBe("idle");
    expect(ceremony.blocking.value).toBe(false);
  });

  it("releases on its own if the flight never reports back", async () => {
    const { state, ceremony } = setup();
    await push(state, snapshot({ log: [event(1, "game-started", "p1")] }));
    await push(
      state,
      snapshot({
        you: { id: "p1", hand: [card("skip", "h1")], peek: null, isHost: true },
        log: [
          event(1, "game-started", "p1"),
          event(2, "kitten-drawn", "p1"),
          event(3, "kitten-defused", "p1"),
        ],
      }),
    );

    // Nothing ever calls `onDefuseFlightDone`; the ceiling has to fire.
    vi.advanceTimersByTime(5000);
    expect(ceremony.blocking.value).toBe(false);
  });

  it("abandons the ceremony when the game stops", async () => {
    const { state, ceremony } = setup();
    await push(state, snapshot({ log: [event(1, "game-started", "p1")] }));
    await push(
      state,
      snapshot({ log: [event(1, "game-started", "p1"), event(2, "kitten-drawn", "p1")] }),
    );
    expect(ceremony.blocking.value).toBe(true);

    await push(state, snapshot({ status: "over", log: [event(3, "game-over", "p2")] }));
    expect(ceremony.blocking.value).toBe(false);
  });
});
