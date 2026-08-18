// @vitest-environment nuxt
import { describe, expect, it, beforeEach } from "vitest";
import type { VoiceMember } from "#shared/protocol/voice";
import { diffRoster, loadVoicePrefs, saveVoicePrefs } from "./useVoiceChat";

/**
 * Only the parts that decide *what* to do are tested here. The WebRTC half is
 * left to the browser: it is all `RTCPeerConnection` calls whose behaviour a
 * fake would only restate.
 */

const member = (playerId: string, micOn = true): VoiceMember => ({
  playerId,
  sessionId: `sess-${playerId}`,
  trackName: `mic-${playerId}`,
  micOn,
});

describe("diffRoster", () => {
  it("pulls everyone in the roster on a cold start", () => {
    const { added, removed } = diffRoster([], [member("p1"), member("p2")], "p1");

    expect(added.map((m) => m.playerId)).toEqual(["p2"]);
    expect(removed).toEqual([]);
  });

  it("never pulls your own track back — that would be an echo", () => {
    const { added } = diffRoster([], [member("p1")], "p1");
    expect(added).toEqual([]);
  });

  it("asks only for members it does not already have", () => {
    const { added, removed } = diffRoster(
      ["p2"],
      [member("p1"), member("p2"), member("p3")],
      "p1",
    );

    expect(added.map((m) => m.playerId)).toEqual(["p3"]);
    expect(removed).toEqual([]);
  });

  it("drops members who left the call", () => {
    const { added, removed } = diffRoster(["p2", "p3"], [member("p1"), member("p2")], "p1");

    expect(added).toEqual([]);
    expect(removed).toEqual(["p3"]);
  });

  it("carries the SFU coordinates needed to pull, not just the id", () => {
    const [first] = diffRoster([], [member("p2")], "p1").added;

    expect(first).toMatchObject({ sessionId: "sess-p2", trackName: "mic-p2" });
  });

  it("treats a mic toggle as no change — micOn is not a subscription", () => {
    const { added, removed } = diffRoster(["p2"], [member("p2", false)], "p1");

    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });
});

describe("voice preferences", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to mic and speaker on, nobody muted", () => {
    const prefs = loadVoicePrefs();

    expect(prefs.micOn).toBe(true);
    expect(prefs.speakerOn).toBe(true);
    expect(prefs.muted).toEqual({});
  });

  it("round-trips through localStorage", () => {
    saveVoicePrefs({
      micOn: false,
      speakerOn: true,
      volume: 0.4,
      micDeviceId: "mic-a",
      muted: { p2: true },
    });

    expect(loadVoicePrefs()).toEqual({
      micOn: false,
      speakerOn: true,
      volume: 0.4,
      micDeviceId: "mic-a",
      muted: { p2: true },
    });
  });

  it("falls back to defaults on a corrupt blob rather than throwing", () => {
    localStorage.setItem("kk:voice", "{not json");
    expect(loadVoicePrefs().micOn).toBe(true);
  });

  it("repairs a half-written entry instead of handing back a bad muted map", () => {
    localStorage.setItem("kk:voice", JSON.stringify({ micOn: false, muted: "nope" }));

    const prefs = loadVoicePrefs();
    expect(prefs.micOn).toBe(false);
    expect(prefs.muted).toEqual({});
  });
});
