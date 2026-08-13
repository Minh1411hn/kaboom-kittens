import { effectScope } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useDrawDrag } from "./useDrawDrag";

/**
 * jsdom has no `PointerEvent`, but a `MouseEvent` under a pointer type name
 * carries everything the composable reads (`clientX/Y`, `button`); `pointerId`
 * comes back `undefined` on both the stored and the incoming event, which
 * matches just as well as a real id would.
 */
function pointer(type: string, x: number, y: number): PointerEvent {
  return new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
  }) as unknown as PointerEvent;
}

/** The hand area, somewhere below the deck. */
const HAND = { left: 100, right: 500, top: 400, bottom: 520 } as DOMRect;

function setup(overrides: { canDraw?: boolean } = {}) {
  const deck = document.createElement("button");
  document.body.append(deck);
  const onDrop = vi.fn();
  const scope = effectScope();

  const drag = scope.run(() =>
    useDrawDrag({
      canDraw: () => overrides.canDraw ?? true,
      dropRect: () => HAND,
      onDrop,
    }),
  )!;

  deck.addEventListener("pointerdown", (event) =>
    drag.start(event as PointerEvent),
  );

  const press = (x: number, y: number) => deck.dispatchEvent(pointer("pointerdown", x, y));
  const move = (x: number, y: number) => deck.dispatchEvent(pointer("pointermove", x, y));
  const release = (x: number, y: number) => deck.dispatchEvent(pointer("pointerup", x, y));

  return { drag, onDrop, scope, deck, press, move, release };
}

describe("useDrawDrag", () => {
  it("stays a tap until the pointer moves past the threshold", () => {
    const { drag, press, move, release, onDrop } = setup();

    press(300, 200);
    expect(drag.phase.value).toBe("lifting");
    expect(drag.ghostVisible.value).toBe(false);

    move(303, 202); // ~3.6px — still a tap
    expect(drag.phase.value).toBe("lifting");

    move(300, 212); // 12px — now a drag
    expect(drag.phase.value).toBe("dragging");
    expect(drag.ghostVisible.value).toBe(true);

    // Letting go on the deck draws nothing: the hand is the only target.
    release(300, 212);
    expect(onDrop).not.toHaveBeenCalled();
    expect(drag.phase.value).toBe("returning");
  });

  it("draws when the card is released over the hand", () => {
    const { drag, press, move, release, onDrop } = setup();

    press(300, 200);
    move(300, 300);
    expect(drag.overDropZone.value).toBe(false);

    move(300, 450);
    expect(drag.overDropZone.value).toBe(true);

    release(300, 450);
    expect(onDrop).toHaveBeenCalledTimes(1);
    // Held until the snapshot answers, so the ghost has somewhere to wait.
    expect(drag.phase.value).toBe("awaiting");

    drag.resolve();
    expect(drag.phase.value).toBe("idle");
  });

  it("refuses to start when drawing is not allowed", () => {
    const { drag, press, move } = setup({ canDraw: false });

    press(300, 200);
    move(300, 300);
    expect(drag.phase.value).toBe("idle");
  });

  it("keeps the card under the grab point rather than snapping it to centre", () => {
    const { drag, press, move } = setup();

    // Pressed 20px right of where the deck's centre reads in jsdom (all zeroes),
    // so the ghost stays 20px behind the pointer for the whole drag.
    press(20, 0);
    move(200, 300);
    expect(drag.x.value).toBe(180);
    expect(drag.y.value).toBe(300);
  });
});
