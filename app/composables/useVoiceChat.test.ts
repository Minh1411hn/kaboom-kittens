// @vitest-environment nuxt
import { describe, expect, it, beforeEach } from "vitest";
import type { VoiceMember } from "#shared/protocol/voice";
import { addOpusDtx, diffRoster, loadVoicePrefs, saveVoicePrefs } from "./useVoiceChat";

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

describe("addOpusDtx", () => {
  const opusLine = "a=rtpmap:111 opus/48000/2";

  it("appends usedtx to an existing fmtp line for the opus payload", () => {
    const sdp = [opusLine, "a=fmtp:111 minptime=10;useinbandfec=1"].join("\r\n");

    expect(addOpusDtx(sdp)).toContain("a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1");
  });

  it("adds a fresh fmtp line when opus has none", () => {
    expect(addOpusDtx(opusLine)).toBe(`${opusLine}\r\na=fmtp:111 usedtx=1`);
  });

  it("is idempotent — never doubles usedtx", () => {
    const sdp = [opusLine, "a=fmtp:111 minptime=10;usedtx=1"].join("\r\n");

    expect(addOpusDtx(sdp)).toBe(sdp);
  });

  it("leaves an SDP without an opus payload untouched", () => {
    const sdp = ["a=rtpmap:9 G722/8000", "a=fmtp:9 something"].join("\r\n");

    expect(addOpusDtx(sdp)).toBe(sdp);
  });

  it("only touches the fmtp line matching opus' own payload type", () => {
    const sdp = [
      "a=rtpmap:9 G722/8000",
      "a=fmtp:9 keepme=1",
      opusLine,
      "a=fmtp:111 minptime=10",
    ].join("\r\n");

    const out = addOpusDtx(sdp);
    expect(out).toContain("a=fmtp:9 keepme=1");
    expect(out).toContain("a=fmtp:111 minptime=10;usedtx=1");
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
