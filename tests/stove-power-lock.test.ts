import { describe, expect, it } from "vitest";
import { directionOf, ON_RISE_WATTS, POWER_LOCK_MS, powerPhase, UNANSWERED_MS, type PowerSent } from "../src/cards/stove/power-lock";

const NOW = 1_000_000_000;
const sent = (over: Partial<PowerSent> = {}): PowerSent => ({ direction: "on", watts: 20, at: NOW, ...over });

describe("directionOf", () => {
  it("reads the way a press should go from the status", () => {
    expect(directionOf("off")).toBe("on");
    expect(directionOf("on")).toBe("off");
    expect(directionOf("pending")).toBe("off");
    expect(directionOf("unavailable")).toBe("unknown");
    expect(directionOf("accent")).toBe("unknown");
  });
});

describe("powerPhase", () => {
  it("is idle with nothing sent", () => {
    expect(powerPhase(undefined, undefined, 20, NOW).phase).toBe("idle");
  });

  it("locks for the full time after a press", () => {
    expect(powerPhase(sent(), undefined, 20, NOW + 1000).phase).toBe("waiting");
    expect(powerPhase(sent(), undefined, 20, NOW + POWER_LOCK_MS - 1).phase).toBe("waiting");
  });

  it("ends early on an ignition jump", () => {
    expect(powerPhase(sent(), undefined, 325, NOW + 3000)).toEqual({ phase: "idle", reacted: true });
    expect(powerPhase(sent(), undefined, 20 + ON_RISE_WATTS, NOW + 3000).reacted).toBe(true);
  });

  it("does not end on small swings of a stove that is on", () => {
    expect(powerPhase(sent({ direction: "off", watts: 30 }), undefined, 60, NOW + 3000).phase).toBe("waiting");
    expect(powerPhase(sent({ watts: 30 }), undefined, 60, NOW + 3000).phase).toBe("waiting");
  });

  it("holds the full lock when turning off, even if the draw rises with the cooling fan", () => {
    const off = sent({ direction: "off", watts: 21.6 });
    expect(powerPhase(off, undefined, 400, NOW + 1000).phase).toBe("waiting");
    expect(powerPhase(off, undefined, 5, NOW + 1000).phase).toBe("waiting");
  });

  it("holds the full lock when the direction is unknown", () => {
    expect(powerPhase(sent({ direction: "unknown" }), undefined, 500, NOW + 1000).phase).toBe("waiting");
  });

  it("has no baseline to compare with when the sensor was missing", () => {
    expect(powerPhase(sent({ watts: undefined }), undefined, 500, NOW + 1000).phase).toBe("waiting");
  });

  it("warns about a turn-on nobody answered, for a few minutes", () => {
    expect(powerPhase(sent(), undefined, 22, NOW + POWER_LOCK_MS).phase).toBe("unanswered");
    expect(powerPhase(sent(), undefined, 22, NOW + UNANSWERED_MS).phase).toBe("idle");
  });

  it("goes quiet after a turn-off, which can't be seen to fail", () => {
    expect(powerPhase(sent({ direction: "off" }), undefined, 22, NOW + POWER_LOCK_MS).phase).toBe("idle");
  });

  it("locks on the script's last run alone, after a reload or from another dashboard", () => {
    expect(powerPhase(undefined, NOW - 5000, 20, NOW).phase).toBe("waiting");
    expect(powerPhase(undefined, NOW - POWER_LOCK_MS, 20, NOW).phase).toBe("idle");
  });

  it("tolerates a few seconds of clock difference but not more", () => {
    expect(powerPhase(undefined, NOW + 2000, 20, NOW).phase).toBe("waiting");
    expect(powerPhase(undefined, NOW + 600_000, 20, NOW).phase).toBe("idle");
  });
});
