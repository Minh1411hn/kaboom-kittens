// @vitest-environment nuxt
import { describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type {
  Card,
  PendingAction,
  PublicGameState,
  PublicPlayer,
} from "#shared/types/game";
import artManifest from "#shared/generated/card-art.json";
import { avatarUrl, deathAvatarUrl } from "../composables/useAvatarArt";
import CardImage from "./CardImage.vue";
import CardArrivalFlyer from "./CardArrivalFlyer.vue";
import CardDepartureFlyer from "./CardDepartureFlyer.vue";
import DeckPositionModal from "./DeckPositionModal.vue";
import KittenRevealOverlay from "./KittenRevealOverlay.vue";
import HandFan from "./HandFan.vue";
import InteractionModal from "./InteractionModal.vue";
import NopeBar from "./NopeBar.vue";
import PlayerSeat from "./PlayerSeat.vue";
import TableCenter from "./TableCenter.vue";
import SeeFutureModal from "./SeeFutureModal.vue";
import TargetSelectModal from "./TargetSelectModal.vue";
import TurnBanner from "./TurnBanner.vue";

/**
 * Smoke tests for the table. These render the components that only ever run in
 * a browser, so a broken template or a bad prop shows up here instead of at
 * the table mid-game.
 */

const card = (id: Card["id"], uid: string): Card => ({ id, uid });

const player = (overrides: Partial<PublicPlayer> = {}): PublicPlayer => ({
  id: "p1",
  nickname: "Whiskers",
  avatarId: "art_02",
  seat: 0,
  handCount: 5,
  alive: true,
  connected: true,
  ready: false,
  ...overrides,
});

describe("CardImage", () => {
  it("shows a card face with its name and rules text", async () => {
    const wrapper = await mountSuspended(CardImage, {
      props: { cardId: "skip", uid: "c1" },
    });
    const img = wrapper.get("img");
    expect(img.attributes("src")).toContain("/cards/skip/artworks/");
    expect(img.attributes("alt")).toBe("Skip");
    expect(wrapper.get(".card").attributes("title")).toContain(
      "End your turn without drawing a card",
    );
  });

  it("shows the back when face down, and never leaks the face", async () => {
    const wrapper = await mountSuspended(CardImage, {
      props: { cardId: "exploding-kitten", uid: "c9", faceDown: true },
    });
    expect(wrapper.get("img").attributes("src")).toContain("/cards/card-back/");
    expect(wrapper.html()).not.toContain("exploding-kitten");
  });

  it("keeps the same artwork variant for a given card", async () => {
    const first = await mountSuspended(CardImage, {
      props: { cardId: "defuse", uid: "abc" },
    });
    const second = await mountSuspended(CardImage, {
      props: { cardId: "defuse", uid: "abc" },
    });
    expect(first.get("img").attributes("src")).toBe(
      second.get("img").attributes("src"),
    );
  });

  it("renders the artwork full-bleed, with no chrome of its own", async () => {
    // The 140x195 art already prints the frame, title and rules text, so the
    // component must add nothing — a second title would print over the first.
    const wrapper = await mountSuspended(CardImage, {
      props: { cardId: "reverse", uid: "r1" },
    });
    expect(wrapper.findAll("img")).toHaveLength(1);
    expect(wrapper.text()).toBe("");
  });

  it("prints no identity at all on a back", async () => {
    const wrapper = await mountSuspended(CardImage, {
      props: { cardId: "exploding-kitten", uid: "c9", faceDown: true },
    });
    // "Kaboom" is the kitten's label — leaking it would give the back away.
    expect(wrapper.text()).not.toContain("Kaboom");
    expect(wrapper.text()).not.toContain("Exploding Kitten");
  });
});

describe("shared cat artwork", () => {
  // The five named cats read one pool, `public/cards/normal-cat/artworks/`.
  // Matching for a combo is done by eye, so two cats of a kind must look alike
  // and two cats of different kinds must not.
  it("gives every copy of one cat the same face", async () => {
    const first = await mountSuspended(CardImage, {
      props: { cardId: "tacocat", uid: "t1" },
    });
    const second = await mountSuspended(CardImage, {
      props: { cardId: "tacocat", uid: "t2" },
    });
    expect(first.get("img").attributes("src")).toBe(
      second.get("img").attributes("src"),
    );
  });

  it("gives two different cats different faces", async () => {
    const taco = await mountSuspended(CardImage, {
      props: { cardId: "tacocat", uid: "t1" },
    });
    const melon = await mountSuspended(CardImage, {
      props: { cardId: "cattermelon", uid: "m1" },
    });
    // Skipped until normal-cat/artworks/ holds at least 5 pictures — with a
    // smaller pool the slots wrap and two cats legitimately share a face.
    const pool = (artManifest as Record<string, string[]>)["normal-cat"];
    if ((pool?.length ?? 0) < 5) return;
    expect(taco.get("img").attributes("src")).not.toBe(
      melon.get("img").attributes("src"),
    );
  });
});

describe("PlayerSeat", () => {
  it("marks the current player, the host and an eliminated player", async () => {
    const current = await mountSuspended(PlayerSeat, {
      props: {
        player: player(),
        isCurrent: true,
        isHost: true,
        isYou: true,
        turnsRemaining: 2,
      },
    });
    expect(current.get(".seat").classes()).toContain("current");
    expect(current.text()).toContain("Whiskers");
    expect(current.text()).toContain("5 cards");
    expect(current.text()).toContain("2 turns left");

    const dead = await mountSuspended(PlayerSeat, {
      props: {
        player: player({ alive: false, handCount: 0 }),
        isCurrent: false,
        isHost: false,
        isYou: false,
        turnsRemaining: 1,
      },
    });
    expect(dead.get(".seat").classes()).toContain("dead");
    expect(dead.get(".avatar-img").attributes("src")).toContain("death.png");
  });

  it("is only clickable while it is a legal target", async () => {
    const wrapper = await mountSuspended(PlayerSeat, {
      props: {
        player: player(),
        isCurrent: false,
        isHost: false,
        isYou: false,
        turnsRemaining: 1,
        targetable: true,
      },
    });
    await wrapper.get(".seat").trigger("click");
    expect(wrapper.emitted("pick")?.[0]).toEqual(["p1"]);

    const locked = await mountSuspended(PlayerSeat, {
      props: {
        player: player(),
        isCurrent: false,
        isHost: false,
        isYou: false,
        turnsRemaining: 1,
      },
    });
    await locked.get(".seat").trigger("click");
    expect(locked.emitted("pick")).toBeUndefined();
  });

  it("fans a card per held card, and caps the fan with an overflow chip", async () => {
    const few = await mountSuspended(PlayerSeat, {
      props: {
        player: player({ handCount: 3 }),
        isCurrent: false,
        isHost: false,
        isYou: false,
        turnsRemaining: 1,
      },
    });
    expect(few.findAll(".mini")).toHaveLength(3);
    expect(few.find(".more").exists()).toBe(false);

    // An opening hand is 8 cards, so the chip must not appear at 8.
    const opening = await mountSuspended(PlayerSeat, {
      props: {
        player: player({ handCount: 8 }),
        isCurrent: false,
        isHost: false,
        isYou: false,
        turnsRemaining: 1,
      },
    });
    expect(opening.findAll(".mini")).toHaveLength(8);
    expect(opening.find(".more").exists()).toBe(false);

    const many = await mountSuspended(PlayerSeat, {
      props: {
        player: player({ handCount: 12 }),
        isCurrent: false,
        isHost: false,
        isYou: false,
        turnsRemaining: 1,
      },
    });
    expect(many.findAll(".mini")).toHaveLength(8);
    expect(many.get(".more").text()).toBe("+4");
  });

  it("swaps a player's avatar for the death art once eliminated", async () => {
    const mount = (alive: boolean) =>
      mountSuspended(PlayerSeat, {
        props: {
          player: player({ alive, avatarId: "art_02" }),
          isCurrent: false,
          isHost: false,
          isYou: false,
          turnsRemaining: 1,
        },
      });

    const alive = await mount(true);
    expect(alive.get(".avatar-img").attributes("src")).toBe(avatarUrl("art_02"));

    const dead = await mount(false);
    expect(dead.get(".avatar-img").attributes("src")).toBe(deathAvatarUrl());
  });
});

describe("HandFan", () => {
  it("renders every card and reports which one was clicked", async () => {
    const hand = [card("skip", "a"), card("nope", "b"), card("tacocat", "c")];
    const wrapper = await mountSuspended(HandFan, {
      props: { hand, selected: ["b"] },
    });
    expect(wrapper.findAll(".slot")).toHaveLength(3);
    expect(wrapper.findAll(".card.selected")).toHaveLength(1);

    await wrapper.findAll(".pick")[2]!.trigger("click");
    expect(wrapper.emitted("toggle")?.[0]).toEqual(["c"]);
  });

  it("copes with an empty hand", async () => {
    const wrapper = await mountSuspended(HandFan, {
      props: { hand: [], selected: [] },
    });
    expect(wrapper.text()).toContain("No cards left");
  });

  it("flips over only the card the drag just delivered", async () => {
    const hand = [card("skip", "a"), card("nope", "b")];
    const wrapper = await mountSuspended(HandFan, {
      props: { hand, selected: [], flipUid: "b" },
    });
    const slots = wrapper.findAll(".slot");
    expect(slots[0]!.classes()).not.toContain("flip-in");
    expect(slots[1]!.classes()).toContain("flip-in");
  });

  it("marks departing cards with leaving class when hand changes", async () => {
    const hand = [card("skip", "a"), card("nope", "b")];
    const wrapper = await mountSuspended(HandFan, {
      props: { hand, selected: [] },
    });
    expect(wrapper.findAll(".slot")).toHaveLength(2);

    await wrapper.setProps({ hand: [card("skip", "a")] });
    const slots = wrapper.findAll(".slot");
    expect(slots).toHaveLength(2);
    expect(slots[1]!.classes()).toContain("leaving");
  });

  it("freezes a departing card while the kitten ceremony holds it", async () => {
    const hand = [card("skip", "a"), card("defuse", "b")];
    const wrapper = await mountSuspended(HandFan, {
      props: { hand, selected: [], holdLeave: true },
    });

    await wrapper.setProps({ hand: [card("skip", "a")] });
    const slots = wrapper.findAll(".slot");
    expect(slots).toHaveLength(2);
    expect(slots[1]!.classes()).toContain("held");
    expect(slots[1]!.classes()).not.toContain("leaving");

    // Released: the departure flyer has the card, so the slot goes at once
    // rather than replaying the lift-out on a card that already flew away.
    await wrapper.setProps({ holdLeave: false });
    expect(wrapper.findAll(".slot")).toHaveLength(1);
  });

  it("holds a card that had already started leaving, whichever prop lands first", async () => {
    const hand = [card("skip", "a"), card("defuse", "b")];
    const wrapper = await mountSuspended(HandFan, {
      props: { hand, selected: [], holdLeave: false },
    });

    await wrapper.setProps({ hand: [card("skip", "a")] });
    expect(wrapper.findAll(".slot")[1]!.classes()).toContain("leaving");

    await wrapper.setProps({ holdLeave: true });
    const slots = wrapper.findAll(".slot");
    expect(slots[1]!.classes()).toContain("held");
    expect(slots[1]!.classes()).not.toContain("leaving");
  });
});

describe("KittenRevealOverlay", () => {
  it("holds the kitten up with the drawer's name", async () => {
    const wrapper = await mountSuspended(KittenRevealOverlay, {
      props: { uid: "kitten-7", playerName: "Mittens", defused: true },
    });
    expect(wrapper.get("img").attributes("src")).toContain(
      "/cards/exploding-kitten/artworks/",
    );
    expect(wrapper.text()).toContain("Mittens");
    // Decoration only — it must never swallow a click meant for the table.
    expect(wrapper.get(".reveal").attributes("aria-hidden")).toBe("true");
  });
});

describe("CardDepartureFlyer", () => {
  const rect = (left: number, top: number): DOMRect =>
    ({ left, top, width: 140, height: 195 }) as DOMRect;

  it("reports done immediately when it has nowhere to fly", async () => {
    const wrapper = await mountSuspended(CardDepartureFlyer, {
      props: { card: null, fromRect: null, measureTo: () => null },
    });

    await wrapper.setProps({ card: card("defuse", "d1"), fromRect: null });
    expect(wrapper.emitted("done")).toHaveLength(1);
    expect(wrapper.find(".flyer").exists()).toBe(false);
  });

  it("puts the clone where the card was before moving it", async () => {
    const wrapper = await mountSuspended(CardDepartureFlyer, {
      props: {
        card: null,
        fromRect: null,
        measureTo: () => rect(600, 300),
      },
    });

    await wrapper.setProps({
      card: card("defuse", "d1"),
      fromRect: rect(100, 500),
    });
    const style = wrapper.get(".flyer").attributes("style") ?? "";
    expect(style).toContain("left: 170px");
    expect(style).toContain("top: 597.5px");
  });
});

describe("TableCenter", () => {
  it("shows both pile counts and only allows a draw when it is your turn", async () => {
    const wrapper = await mountSuspended(TableCenter, {
      props: {
        drawCount: 31,
        discardTop: card("favor", "d1"),
        discardCount: 4,
        direction: 1,
        canDraw: false,
        deadline: null,
        peek: null,
      },
    });
    expect(wrapper.text()).toContain("31");
    expect(wrapper.text()).toContain("4");
    expect(wrapper.get(".deck").attributes("disabled")).toBeDefined();

    // Drawing is a drag: the press starts a gesture, it never draws by itself.
    await wrapper.setProps({ canDraw: true });
    await wrapper.get(".deck").trigger("pointerdown");
    expect(wrapper.emitted("drawPointerDown")).toHaveLength(1);
    expect(wrapper.emitted("draw")).toBeUndefined();
    await wrapper.get(".deck").trigger("click");
    expect(wrapper.emitted("draw")).toBeUndefined();

    // Keyboard is the one path that draws outright.
    await wrapper.get(".deck").trigger("keydown.enter");
    expect(wrapper.emitted("draw")).toHaveLength(1);
  });

  it("renders direction and card counts", async () => {
    const wrapper = await mountSuspended(TableCenter, {
      props: {
        drawCount: 10,
        discardTop: null,
        discardCount: 0,
        direction: -1,
        canDraw: false,
        deadline: null,
      },
    });
    expect(
      wrapper.get(".direction").findComponent({ name: "Icon" }).props("name"),
    ).toBe("lucide:rotate-ccw");
    expect(wrapper.text()).toContain("Còn 10 lá");
    expect(wrapper.text()).toContain("Chiều bốc bài");
  });
});

describe("SeeFutureModal", () => {
  it("renders peeked cards in order", async () => {
    const wrapper = await mountSuspended(SeeFutureModal, {
      props: {
        cards: [card("skip", "p1"), card("defuse", "p2")],
      },
    });
    expect(wrapper.text()).toContain("Nhìn thấu tương lai");
    expect(wrapper.text()).toContain("Top #1 (Trên cùng)");
    expect(wrapper.text()).toContain("#2");
    expect(wrapper.findAll(".card")).toHaveLength(2);
  });

  it("emits close when clicking the X close button", async () => {
    const wrapper = await mountSuspended(SeeFutureModal, {
      props: {
        cards: [card("skip", "p1")],
      },
    });
    await wrapper.get(".close-btn").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("emits close when clicking the footer action button", async () => {
    const wrapper = await mountSuspended(SeeFutureModal, {
      props: {
        cards: [card("skip", "p1")],
      },
    });
    await wrapper.get(".dialog-footer button").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("in editable mode, has no close button and submits the current order", async () => {
    const cards = [card("skip", "p1"), card("defuse", "p2")];
    const wrapper = await mountSuspended(SeeFutureModal, {
      props: { cards, editable: true },
    });
    expect(wrapper.text()).toContain("Sắp xếp lại tương lai");
    expect(wrapper.find(".close-btn").exists()).toBe(false);

    await wrapper.get(".dialog-footer button").trigger("click");
    expect(wrapper.emitted("submit")?.[0]).toEqual([["p1", "p2"]]);
  });
});

describe("TurnBanner", () => {
  const base = {
    isYourTurn: false,
    currentPlayerName: "Mittens",
    deadline: null,
    actorColor: "#2f9bdb",
  };

  it("names whoever is on the clock, and shouts when it is you", async () => {
    const waiting = await mountSuspended(TurnBanner, { props: base });
    expect(waiting.text()).toContain("Waiting for Mittens");
    expect(waiting.classes()).not.toContain("live");

    const yours = await mountSuspended(TurnBanner, {
      props: { ...base, isYourTurn: true },
    });
    expect(yours.text()).toContain("It's your turn!");
    expect(yours.classes()).toContain("live");
  });

  it("shows the hint and the slotted controls", async () => {
    const wrapper = await mountSuspended(TurnBanner, {
      props: { ...base, isYourTurn: true, hint: "Now pick a player above." },
      slots: { default: "<button>Play</button>" },
    });
    expect(wrapper.get(".hint").text()).toBe("Now pick a player above.");
    expect(wrapper.get(".controls button").text()).toBe("Play");
  });

  it("counts down only once there is a deadline", async () => {
    const none = await mountSuspended(TurnBanner, { props: base });
    expect(none.find(".clock").exists()).toBe(false);

    const ticking = await mountSuspended(TurnBanner, {
      props: { ...base, deadline: Date.now() + 30_000 },
    });
    expect(ticking.get(".clock-text").text()).toMatch(/^\d+s$/);
  });
});

describe("NopeBar", () => {
  const stack: PendingAction[] = [
    {
      id: "a1",
      playerId: "p1",
      cardId: "attack-2x",
      cardUids: ["x"],
      combo: null,
      targetPlayerId: null,
      namedCardId: null,
      nopeable: true,
    },
  ];

  it("offers NOPE only to someone holding one who did not play the top card", async () => {
    const wrapper = await mountSuspended(NopeBar, {
      props: {
        stack,
        deadline: Date.now() + 5000,
        players: [player(), player({ id: "p2", nickname: "Mittens" })],
        hasNope: true,
        youPlayedTop: false,
        passed: false,
      },
    });
    expect(wrapper.text()).toContain("Whiskers");
    expect(wrapper.text()).toContain("đã dùng");
    await wrapper.get("button.danger").trigger("click");
    expect(wrapper.emitted("nope")).toHaveLength(1);

    const own = await mountSuspended(NopeBar, {
      props: {
        stack,
        deadline: Date.now() + 5000,
        players: [player()],
        hasNope: true,
        youPlayedTop: true,
        passed: false,
      },
    });
    expect(own.find("button.danger").exists()).toBe(false);
    expect(own.text()).toContain("Đang chờ");
  });

  it("shows target player when action has a target", async () => {
    const targetedStack: PendingAction[] = [
      {
        ...stack[0]!,
        cardId: "targeted-attack-2x",
        targetPlayerId: "p2",
      },
    ];
    const wrapper = await mountSuspended(NopeBar, {
      props: {
        stack: targetedStack,
        deadline: Date.now() + 5000,
        players: [player(), player({ id: "p2", nickname: "Mittens" })],
        hasNope: false,
        youPlayedTop: false,
        passed: false,
      },
    });
    expect(wrapper.text()).toContain("Whiskers");
    expect(wrapper.text()).toContain("Mittens");
    expect(wrapper.find(".player-pill.target").exists()).toBe(true);
  });

  it("spells out the verdict and renders avatar badge as Nopes stack up", async () => {
    const twoNopes: PendingAction[] = [
      stack[0]!,
      { ...stack[0]!, id: "a2", cardId: "nope", playerId: "p2" },
      { ...stack[0]!, id: "a3", cardId: "nope", playerId: "p1" },
    ];
    const wrapper = await mountSuspended(NopeBar, {
      props: {
        stack: twoNopes,
        deadline: Date.now() + 5000,
        players: [player(), player({ id: "p2", nickname: "Mittens" })],
        hasNope: false,
        youPlayedTop: false,
        passed: false,
      },
    });
    expect(wrapper.text()).toContain("2 Nope");
    expect(wrapper.text()).toContain("Đang có hiệu lực");
    expect(wrapper.findAll(".card-avatar-badge")).toHaveLength(2);
  });
});

describe("InteractionModal", () => {
  const base = {
    id: "i1",
    kind: "choose-card-from-hand" as const,
    cardId: "favor" as const,
    requiredFrom: ["p1"],
    prompt: "Choose a card to give to Mittens",
    deadline: Date.now() + 30000,
    isForYou: true,
    answered: [] as string[],
  };

  it("lets the chosen player pick a card and confirm", async () => {
    const wrapper = await mountSuspended(InteractionModal, {
      props: {
        interaction: {
          ...base,
          cards: [card("skip", "s1"), card("shuffle", "s2")],
        },
        hand: [],
        players: [player()],
      },
    });
    expect(wrapper.text()).toContain("Choose a card to give");
    const confirm = wrapper.findAll("button").at(-1)!;
    expect(confirm.attributes("disabled")).toBeDefined();

    await wrapper.findAll(".choice")[1]!.trigger("click");
    await confirm.trigger("click");
    expect(wrapper.emitted("submit")?.[0]).toEqual([
      { type: "card", uid: "s2" },
    ]);
  });

  it("shows bystanders who is being waited on, and no cards", async () => {
    const wrapper = await mountSuspended(InteractionModal, {
      props: {
        interaction: {
          ...base,
          isForYou: false,
          cards: undefined,
          requiredFrom: ["p1"],
        },
        hand: [],
        players: [player()],
      },
    });
    expect(wrapper.text()).toContain("Waiting for Whiskers");
    expect(wrapper.findAll(".choice")).toHaveLength(0);
  });
});

describe("DeckPositionModal", () => {
  const base = {
    id: "i1",
    kind: "choose-deck-position" as const,
    cardId: "defuse" as const,
    requiredFrom: ["p1"],
    prompt: "Secretly put the Exploding Kitten back into the deck",
    deadline: Date.now() + 30000,
    isForYou: true,
    answered: [] as string[],
  };

  it("disables Confirm until a position is chosen", async () => {
    const wrapper = await mountSuspended(DeckPositionModal, {
      props: { interaction: { ...base, maxPosition: 20 } },
    });
    const confirm = wrapper.findAll("button").at(-1)!;
    expect(confirm.attributes("disabled")).toBeDefined();
  });

  it("maps numbered button N to index N-1", async () => {
    const wrapper = await mountSuspended(DeckPositionModal, {
      props: { interaction: { ...base, maxPosition: 20 } },
    });
    const btn3 = wrapper.findAll("button").find((b) => b.text() === "3")!;
    await btn3.trigger("click");
    await wrapper.findAll("button").at(-1)!.trigger("click");
    expect(wrapper.emitted("submit")?.[0]).toEqual([2]);
  });

  it("submits the bottom position", async () => {
    const wrapper = await mountSuspended(DeckPositionModal, {
      props: { interaction: { ...base, maxPosition: 20 } },
    });
    const bottom = wrapper
      .findAll("button")
      .find((b) => b.text() === "Đặt ở cuối")!;
    await bottom.trigger("click");
    expect(wrapper.text()).toContain("Dưới cùng");

    await wrapper.findAll("button").at(-1)!.trigger("click");
    expect(wrapper.emitted("submit")?.[0]).toEqual([20]);
  });

  it("random picks a position in range and still requires Confirm", async () => {
    const wrapper = await mountSuspended(DeckPositionModal, {
      props: { interaction: { ...base, maxPosition: 20 } },
    });
    const random = wrapper
      .findAll("button")
      .find((b) => b.text().includes("RANDOM"))!;
    await random.trigger("click");
    // Still needs an explicit Confirm — clicking RANDOM only previews.
    expect(wrapper.emitted("submit")).toBeUndefined();

    await wrapper.findAll("button").at(-1)!.trigger("click");
    const [index] = wrapper.emitted("submit")![0] as [number];
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThanOrEqual(20);
  });

  it("hides numbered buttons beyond maxPosition", async () => {
    const wrapper = await mountSuspended(DeckPositionModal, {
      props: { interaction: { ...base, maxPosition: 2 } },
    });
    const labels = wrapper.findAll("button").map((b) => b.text());
    expect(labels).toContain("1");
    expect(labels).toContain("2");
    expect(labels).not.toContain("3");
    expect(labels).not.toContain("4");
    expect(labels).not.toContain("5");
    expect(labels).toContain("Đặt ở cuối");
  });
});

describe("usePlayIntent", () => {
  const state = (overrides: Partial<PublicGameState> = {}) =>
    ref({
      actionStack: [],
      discardCount: 3,
      you: { id: "p1", hand: [], peek: null, isHost: false },
      ...overrides,
    } as unknown as PublicGameState);

  it("accepts a lone action card on your turn and refuses it off-turn", () => {
    const selected = ref([card("skip", "s1")]);
    expect(usePlayIntent(selected, state(), ref(true)).value.ok).toBe(true);
    expect(usePlayIntent(selected, state(), ref(false)).value.reason).toMatch(
      /wait for your turn/i,
    );
  });

  it("refuses a lone cat card and explains why", () => {
    const selected = ref([card("tacocat", "c1")]);
    expect(usePlayIntent(selected, state(), ref(true)).value.reason).toMatch(
      /combo of 2, 3 or 5/i,
    );
  });

  it("accepts matching cat pairs, including with Feral Cat", () => {
    const pair = usePlayIntent(
      ref([card("tacocat", "a"), card("tacocat", "b")]),
      state(),
      ref(true),
    );
    expect(pair.value).toMatchObject({
      ok: true,
      combo: "pair",
      needsTarget: true,
    });

    const feral = usePlayIntent(
      ref([card("beard-cat", "a"), card("feral-cat", "b")]),
      state(),
      ref(true),
    );
    expect(feral.value.combo).toBe("pair");

    const mismatch = usePlayIntent(
      ref([card("beard-cat", "a"), card("tacocat", "b")]),
      state(),
      ref(true),
    );
    expect(mismatch.value.ok).toBe(false);
  });

  it("asks for a named card on a three-of-a-kind", () => {
    const triple = usePlayIntent(
      ref([card("tacocat", "a"), card("tacocat", "b"), card("feral-cat", "c")]),
      state(),
      ref(true),
    );
    expect(triple.value).toMatchObject({
      combo: "triple",
      needsTarget: true,
      needsNamedCard: true,
    });
  });

  it("needs a non-empty discard pile for the five-card combo", () => {
    const five = [
      card("skip", "a"),
      card("favor", "b"),
      card("shuffle", "c"),
      card("nope", "d"),
      card("reverse", "e"),
    ];
    expect(usePlayIntent(ref(five), state(), ref(true)).value.combo).toBe(
      "five-different",
    );
    expect(
      usePlayIntent(ref(five), state({ discardCount: 0 }), ref(true)).value
        .reason,
    ).toMatch(/discard pile is empty/i);
  });

  it("allows Nope out of turn, but not against your own card", () => {
    const nope = ref([card("nope", "n1")]);
    const withAction = state({
      actionStack: [{ playerId: "p2" } as PendingAction],
    });
    expect(usePlayIntent(nope, withAction, ref(false)).value.ok).toBe(true);

    const yours = state({ actionStack: [{ playerId: "p1" } as PendingAction] });
    expect(usePlayIntent(nope, yours, ref(false)).value.reason).toMatch(
      /your own card/i,
    );

    expect(usePlayIntent(nope, state(), ref(false)).value.reason).toMatch(
      /nothing to Nope/i,
    );
  });
});

describe("TargetSelectModal", () => {
  it("renders targetable players and allows confirming a steal", async () => {
    const players = [
      player({ id: "p1", nickname: "Whiskers" }),
      player({ id: "p2", nickname: "Mittens", handCount: 4 }),
      player({ id: "p3", nickname: "Boots", handCount: 0, alive: false }),
    ];
    const wrapper = await mountSuspended(TargetSelectModal, {
      props: {
        players,
        youId: "p1",
        combo: "pair",
      },
    });

    expect(wrapper.text()).toContain("Cướp 1 lá bài ngẫu nhiên");
    expect(wrapper.findAll(".target-card")).toHaveLength(1);
    expect(wrapper.text()).toContain("Mittens");

    const confirmBtn = wrapper.find("button.confirm-btn");
    expect(confirmBtn.attributes("disabled")).toBeDefined();

    await wrapper.find(".target-card").trigger("click");
    expect(confirmBtn.attributes("disabled")).toBeUndefined();

    await confirmBtn.trigger("click");
    expect(wrapper.emitted("confirm")?.[0]).toEqual(["p2", undefined]);
  });

  it("shows demand options for triple combo and requires both target and card selection", async () => {
    const players = [
      player({ id: "p1", nickname: "Whiskers" }),
      player({ id: "p2", nickname: "Mittens", handCount: 3 }),
    ];
    const wrapper = await mountSuspended(TargetSelectModal, {
      props: {
        players,
        youId: "p1",
        combo: "triple",
        needsNamedCard: true,
      },
    });

    expect(wrapper.text()).toContain("Đòi 1 lá bài cụ thể");
    expect(wrapper.findAll(".card-choice-btn").length).toBeGreaterThan(5);

    const confirmBtn = wrapper.find("button.confirm-btn");
    expect(confirmBtn.attributes("disabled")).toBeDefined();

    await wrapper.find(".target-card").trigger("click");
    expect(confirmBtn.attributes("disabled")).toBeDefined();

    await wrapper.findAll(".card-choice-btn")[0]!.trigger("click");
    expect(confirmBtn.attributes("disabled")).toBeUndefined();

    await confirmBtn.trigger("click");
    expect(wrapper.emitted("confirm")).toHaveLength(1);
  });
});

describe("CardArrivalFlyer", () => {
  it("renders when arrivingCards are provided", async () => {
    const arriving = [card("defuse", "c1")];
    const wrapper = await mountSuspended(CardArrivalFlyer, {
      props: {
        arrivingCards: arriving,
      },
    });
    expect(wrapper.find(".flyer-container").exists()).toBe(true);
  });
});

