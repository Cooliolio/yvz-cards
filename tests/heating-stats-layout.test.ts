import { describe, expect, it } from "vitest";
import { clusterPins, initialOf, NEUTRAL, PIN_PALETTE, pinFraction, userColors, type Pin } from "../src/design/pins";
import { ACCENT_TILES, tileColumns, tilesFor } from "../src/cards/heating-stats/tiles";
import { loadStats, type StatsEntities } from "../src/cards/heating-stats/history";
import type { HomeAssistant } from "../src/shared/types";

const FROM = 1_000_000_000;
const TO = FROM + 7 * 86_400_000;
// A 700 px chart over 7 days: 1 px is 14.4 minutes, so 18 px is about 4.3 hours.
const WIDTH = 700;
const PX = (TO - FROM) / WIDTH;

const pin = (px: number, who = "Yasin", color = 1, over: Partial<Pin> = {}): Pin => ({
  id: `p${px}${who}`,
  t: FROM + px * PX,
  text: "Target 17.5°",
  who,
  when: "Mon",
  initial: initialOf(who),
  color,
  ...over,
});

describe("pinFraction", () => {
  it("maps a moment to 0..1 of the window", () => {
    expect(pinFraction(FROM, FROM, TO)).toBe(0);
    expect(pinFraction(TO, FROM, TO)).toBe(1);
    expect(pinFraction(FROM + (TO - FROM) / 4, FROM, TO)).toBe(0.25);
  });

  it("sticks to the edge outside the window and survives an empty one", () => {
    expect(pinFraction(FROM - 5, FROM, TO)).toBe(0);
    expect(pinFraction(TO + 5, FROM, TO)).toBe(1);
    expect(pinFraction(FROM, FROM, FROM)).toBe(0);
  });
});

describe("clusterPins", () => {
  it("keeps pins that are far apart separate, in time order", () => {
    const out = clusterPins([pin(200), pin(50), pin(500)], FROM, TO, WIDTH);
    expect(out.map((c) => c.pins.length)).toEqual([1, 1, 1]);
    expect(out[0].at).toBeCloseTo(50 / WIDTH, 5);
  });

  it("merges pins within 18 px of the first one into a cluster", () => {
    const out = clusterPins([pin(100), pin(108), pin(117)], FROM, TO, WIDTH);
    expect(out).toHaveLength(1);
    expect(out[0].pins).toHaveLength(3);
    expect(out[0].at).toBeCloseTo(108 / WIDTH, 3);
  });

  it("starts a new cluster past 18 px, measured from the first pin and not by chaining", () => {
    const out = clusterPins([pin(100), pin(110), pin(120), pin(130)], FROM, TO, WIDTH);
    expect(out.map((c) => c.pins.length)).toEqual([2, 2]);
  });

  it("keeps the letter and colour of one hand, and goes neutral when hands differ", () => {
    const same = clusterPins([pin(100), pin(104)], FROM, TO, WIDTH)[0];
    expect(same).toMatchObject({ initial: "Y", color: 1 });
    const mixed = clusterPins([pin(100, "Yasin", 1), pin(104, "Muzaffer", 0)], FROM, TO, WIDTH)[0];
    expect(mixed).toMatchObject({ initial: "", color: NEUTRAL });
  });

  it("reports the latest change of a cluster", () => {
    const a = pin(100);
    const b = pin(105);
    expect(clusterPins([b, a], FROM, TO, WIDTH)[0].until).toBe(b.t);
  });

  it("clusters more as the chart gets narrower", () => {
    const pins = [pin(100), pin(150), pin(200)];
    expect(clusterPins(pins, FROM, TO, 700)).toHaveLength(3);
    expect(clusterPins(pins, FROM, TO, 200)).toHaveLength(2);
    expect(clusterPins(pins, FROM, TO, 100)).toHaveLength(1);
  });

  it("has nothing to draw without pins", () => {
    expect(clusterPins([], FROM, TO, WIDTH)).toEqual([]);
  });
});

describe("userColors", () => {
  it("gives each person a different colour, ranked by user id and the same every time", () => {
    const a = userColors(["user-b", "user-a"]);
    expect(a.get("user-a")).toBe(0);
    expect(a.get("user-b")).toBe(1);
    expect(userColors(["user-a", "user-b", "user-a"])).toEqual(a);
  });

  it("wraps once there are more people than colours", () => {
    const ids = Array.from({ length: PIN_PALETTE.length + 1 }, (_, i) => `u${i}`);
    expect(userColors(ids).get(`u${PIN_PALETTE.length}`)).toBe(0);
  });
});

describe("initialOf", () => {
  it("is the first letter in capitals, or a question mark", () => {
    expect(initialOf("muzaffer")).toBe("M");
    expect(initialOf("  éva")).toBe("É");
    expect(initialOf("")).toBe("?");
  });
});

describe("tilesFor", () => {
  const some = { outdoor: true, degreeDays: 12, atTarget: 0.8, heatingRate: 1.2 };

  it("draws all eight with everything present", () => {
    expect(tilesFor(some)).toEqual(["runtime", "starts", "longest", "avg", "degree_days", "per_degree_day", "at_target", "rate"]);
  });

  it("leaves out the degree-day tiles without the outdoor sensor, or without degree-day data", () => {
    expect(tilesFor({ ...some, outdoor: false })).not.toContain("degree_days");
    expect(tilesFor({ ...some, degreeDays: undefined })).not.toContain("per_degree_day");
  });

  it("keeps the degree-day tiles when it is mild, where they are zero", () => {
    expect(tilesFor({ ...some, degreeDays: 0 })).toContain("per_degree_day");
  });

  it("leaves out time at target on 30 days, and the rate when there is none", () => {
    expect(tilesFor({ ...some, atTarget: undefined })).not.toContain("at_target");
    expect(tilesFor({ ...some, heatingRate: undefined })).not.toContain("rate");
  });

  it("is four tiles at the least, five and seven in between", () => {
    expect(tilesFor({ outdoor: false })).toHaveLength(4);
    expect(tilesFor({ outdoor: false, atTarget: 0.5 })).toHaveLength(5);
    expect(tilesFor({ ...some, heatingRate: undefined })).toHaveLength(7);
  });

  it("marks the four outside-data tiles as accented", () => {
    expect(ACCENT_TILES).toEqual(["degree_days", "per_degree_day", "at_target", "rate"]);
  });
});

describe("tileColumns", () => {
  it("keeps one row when everything fits", () => {
    expect(tileColumns(8, 1400)).toBe(8);
    expect(tileColumns(4, 1400)).toBe(4);
  });

  it("splits evenly instead of leaving a lone tile", () => {
    expect(tileColumns(8, 1000)).toBe(4);
    expect(tileColumns(5, 700)).toBe(3);
    expect(tileColumns(7, 700)).toBe(4);
  });

  it("is two per row on a phone", () => {
    expect(tileColumns(8, 358)).toBe(2);
    expect(tileColumns(5, 358)).toBe(2);
  });

  it("never gives more columns than tiles, or fewer than one", () => {
    expect(tileColumns(3, 2000)).toBe(3);
    expect(tileColumns(4, 100)).toBe(1);
    expect(tileColumns(0, 500)).toBe(1);
  });
});

describe("loadStats keeps every event for the pins", () => {
  const now = Date.parse("2026-11-01T20:00:00Z");
  const ids: StatsEntities = {
    pump: "binary_sensor.pump",
    control: "sensor.control",
    climate: "climate.heating",
    trend: "sensor.trend",
    mode: "input_select.mode",
    leading: "input_select.leading",
    sensors: "sensor.sensors",
    warnings: {},
    targets: { target: "n.t", comfort: "n.c", eco: "n.e", frost_temp: "n.f" },
  };

  it("does not cut the list at 20", async () => {
    const hass = {
      states: {},
      async callWS(m: Record<string, unknown>) {
        const out: Record<string, unknown[]> = {};
        for (const id of m.entity_ids as string[]) {
          if (id === ids.mode) {
            // 30 mode changes, an hour apart.
            out[id] = Array.from({ length: 31 }, (_, i) => ({ s: i % 2 ? "On" : "Off", lu: (now - (31 - i) * 3_600_000) / 1000 }));
          } else out[id] = [];
        }
        return out;
      },
    } as unknown as HomeAssistant;
    const data = await loadStats(hass, ids, {}, "week", now);
    expect(data.events.length).toBe(30);
  });
});
