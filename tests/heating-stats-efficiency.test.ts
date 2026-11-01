import { describe, expect, it } from "vitest";
import {
  activeIntervals,
  adherence,
  dayMeans,
  degreeDays,
  degreeDaysOf,
  hoursPerDegreeDay,
  leaderMix,
  seasonStart,
  shortCycles,
} from "../src/cards/heating-stats/efficiency";
import { humidityOf } from "../src/cards/heating-stats/humidity";
import { loadStats, type StatsEntities } from "../src/cards/heating-stats/history";
import { loadSeason } from "../src/cards/heating-stats/season";
import type { HassEntity, HomeAssistant } from "../src/shared/types";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// Local midnight of a fixed day, so the maths below doesn't depend on when the tests run.
const D0 = new Date(2026, 9, 20).getTime();
const flat = (v: number, from: number, to: number, step = HOUR) => {
  const out = [];
  for (let t = from; t <= to; t += step) out.push({ t, v });
  return out;
};

describe("degree-days", () => {
  it("is the shortfall below 18° of the day's average", () => {
    expect(degreeDaysOf(8)).toBe(10);
    expect(degreeDaysOf(8, 0.5)).toBe(5);
  });

  it("is zero on a day that averages above the base", () => {
    expect(degreeDaysOf(21)).toBe(0);
    expect(degreeDays(flat(21, D0, D0 + DAY), D0, D0 + DAY)).toBe(0);
  });

  it("adds up whole days", () => {
    expect(degreeDays(flat(8, D0, D0 + 3 * DAY), D0, D0 + 3 * DAY)).toBeCloseTo(30, 5);
  });

  it("counts a part of a day in proportion", () => {
    expect(degreeDays(flat(8, D0, D0 + 6 * HOUR), D0, D0 + 6 * HOUR)).toBeCloseTo(2.5, 5);
  });

  it("takes each day's own average, so a warm day does not cancel a cold one", () => {
    const points = [...flat(0, D0, D0 + DAY - 1), ...flat(30, D0 + DAY, D0 + 2 * DAY)];
    expect(degreeDays(points, D0, D0 + 2 * DAY)).toBeCloseTo(18, 3);
  });

  it("says nothing without outdoor data, or when it only begins late in the window", () => {
    expect(degreeDays([], D0, D0 + DAY)).toBeUndefined();
    expect(degreeDays(flat(5, D0 + 2 * DAY, D0 + 3 * DAY), D0, D0 + 3 * DAY)).toBeUndefined();
  });

  it("holds the last reading, like the stepped sensor it is", () => {
    expect(degreeDays([{ t: D0 - 5 * DAY, v: 8 }], D0, D0 + DAY)).toBeCloseTo(10, 5);
  });
});

describe("hoursPerDegreeDay", () => {
  it("divides the pump hours by the degree-days", () => {
    expect(hoursPerDegreeDay(6 * HOUR, 12)).toBe(0.5);
  });

  it("gives nothing for zero or almost no degree-days, or no data", () => {
    expect(hoursPerDegreeDay(6 * HOUR, 0)).toBeUndefined();
    expect(hoursPerDegreeDay(6 * HOUR, 0.4)).toBeUndefined();
    expect(hoursPerDegreeDay(6 * HOUR, undefined)).toBeUndefined();
  });

  it("is zero when the pump did not run on a cold day", () => {
    expect(hoursPerDegreeDay(0, 10)).toBe(0);
  });
});

describe("dayMeans", () => {
  it("averages each day, and the current day only up to now", () => {
    const points = [...flat(4, D0, D0 + DAY - 1), ...flat(10, D0 + DAY, D0 + 2 * DAY)];
    const out = dayMeans(points, [D0, D0 + DAY], D0 + DAY + 6 * HOUR);
    expect(out[0]).toBeCloseTo(4, 5);
    expect(out[1]).toBeCloseTo(10, 5);
  });

  it("leaves a day without data empty", () => {
    expect(dayMeans([], [D0], D0 + DAY)).toEqual([undefined]);
  });
});

describe("adherence", () => {
  const active = [[D0, D0 + 10 * HOUR]] as Array<[number, number]>;

  it("is the share of the active time the room was at the target", () => {
    const room = [{ t: D0, v: 18 }, { t: D0 + 4 * HOUR, v: 20 }];
    const target = [{ t: D0, v: 20 }];
    expect(adherence(room, target, active, D0, D0 + 10 * HOUR)?.share).toBeCloseTo(0.6, 5);
  });

  it("allows 0.3° under the target", () => {
    expect(adherence([{ t: D0, v: 19.75 }], [{ t: D0, v: 20 }], active, D0, D0 + 10 * HOUR)?.share).toBe(1);
    expect(adherence([{ t: D0, v: 19.6 }], [{ t: D0, v: 20 }], active, D0, D0 + 10 * HOUR)?.share).toBe(0);
  });

  it("ignores the time the mode was off, even with a frost target", () => {
    const off = [[D0, D0 + 2 * HOUR]] as Array<[number, number]>;
    const room = [{ t: D0, v: 18 }, { t: D0 + 2 * HOUR, v: 18 }];
    expect(adherence(room, [{ t: D0, v: 7 }], off, D0, D0 + 10 * HOUR)?.ms).toBe(2 * HOUR);
    expect(adherence(room, [{ t: D0, v: 7 }], [], D0, D0 + 10 * HOUR)).toBeUndefined();
  });

  it("ignores a thermostat with no target", () => {
    expect(adherence([{ t: D0, v: 18 }], [{ t: D0, v: 0 }], active, D0, D0 + 10 * HOUR)).toBeUndefined();
  });

  it("says nothing for under half an hour", () => {
    expect(adherence([{ t: D0, v: 20 }], [{ t: D0, v: 20 }], [[D0, D0 + 20 * MIN]], D0, D0 + HOUR)).toBeUndefined();
  });
});

describe("activeIntervals", () => {
  it("covers everything but off, and handles the start and the end", () => {
    const out = activeIntervals(
      [{ t: D0 - HOUR, s: "Eco" }, { t: D0 + HOUR, s: "Off" }, { t: D0 + 2 * HOUR, s: "Comfort" }],
      D0,
      D0 + 5 * HOUR,
    );
    expect(out).toEqual([[D0, D0 + HOUR], [D0 + 2 * HOUR, D0 + 5 * HOUR]]);
  });
});

describe("shortCycles", () => {
  const runs = (starts: number[], len: number): Array<[number, number]> => starts.map((s) => [D0 + s * MIN, D0 + s * MIN + len * MIN]);

  it("flags three or more short runs close together as one", () => {
    expect(shortCycles(runs([100, 110, 120, 130], 3), D0)).toEqual([{ t: D0 + 130 * MIN, runs: 4 }]);
  });

  it("does not flag one or two short runs", () => {
    expect(shortCycles(runs([100, 110], 3), D0)).toEqual([]);
  });

  it("does not count normal runs, or runs far apart", () => {
    expect(shortCycles(runs([100, 110, 120], 20), D0)).toEqual([]);
    expect(shortCycles(runs([100, 300, 500], 3), D0)).toEqual([]);
  });

  it("splits two clusters", () => {
    expect(shortCycles(runs([100, 110, 120, 600, 610, 620], 2), D0)).toHaveLength(2);
  });

  it("does not judge a run the window cut short", () => {
    expect(shortCycles([[D0, D0 + 2 * MIN], ...runs([10, 20], 2)], D0)).toEqual([]);
  });
});

describe("leaderMix", () => {
  it("names the room that led longest and counts the others", () => {
    const mix = leaderMix([{ t: D0, s: "Slaapkamer" }, { t: D0 + 20 * HOUR, s: "Woonkamer" }], D0, D0 + DAY);
    expect(mix).toEqual({ main: "Slaapkamer", others: 1 });
  });

  it("is alone when nobody else led, and nothing without history", () => {
    expect(leaderMix([{ t: D0, s: "Slaapkamer" }], D0, D0 + DAY)).toEqual({ main: "Slaapkamer", others: 0 });
    expect(leaderMix([], D0, D0 + DAY)).toBeUndefined();
  });
});

describe("seasonStart", () => {
  it("defaults to the most recent 1 October", () => {
    expect(seasonStart(undefined, new Date(2026, 10, 2).getTime())).toBe(new Date(2026, 9, 1).getTime());
    expect(seasonStart(undefined, new Date(2026, 2, 2).getTime())).toBe(new Date(2025, 9, 1).getTime());
  });

  it("reads MM-DD and ignores nonsense", () => {
    expect(seasonStart("09-15", new Date(2026, 10, 2).getTime())).toBe(new Date(2026, 8, 15).getTime());
    expect(seasonStart("13-40", new Date(2026, 10, 2).getTime())).toBe(new Date(2026, 9, 1).getTime());
    expect(seasonStart("soon", new Date(2026, 10, 2).getTime())).toBe(new Date(2026, 9, 1).getTime());
  });
});

describe("humidityOf", () => {
  const st = (id: string, state: string, attributes = {}) => ({ entity_id: id, state, attributes }) as unknown as HassEntity;

  it("finds the humidity sensor on the same device", () => {
    const hass = {
      states: { "sensor.a_temperature": st("sensor.a_temperature", "20"), "sensor.odd": st("sensor.odd", "61", { device_class: "humidity" }) },
      entities: {
        "sensor.a_temperature": { entity_id: "sensor.a_temperature", device_id: "d1", platform: "x" },
        "sensor.odd": { entity_id: "sensor.odd", device_id: "d1", platform: "x" },
      },
    };
    expect(humidityOf(hass, "sensor.a_temperature")).toBe(61);
  });

  it("falls back to the name, and gives nothing when there is none", () => {
    const hass = { states: { "sensor.b_humidity": st("sensor.b_humidity", "47") }, entities: {} };
    expect(humidityOf(hass, "sensor.b_temperature")).toBe(47);
    expect(humidityOf(hass, "sensor.c_temperature")).toBeUndefined();
    expect(humidityOf({ states: {} }, "sensor.x")).toBeUndefined();
  });

  it("ignores a humidity sensor of another device and a non-number", () => {
    const hass = {
      states: { "sensor.o": st("sensor.o", "unavailable", { device_class: "humidity" }), "sensor.p": st("sensor.p", "50", { device_class: "humidity" }) },
      entities: {
        "sensor.a_temperature": { entity_id: "sensor.a_temperature", device_id: "d1", platform: "x" },
        "sensor.o": { entity_id: "sensor.o", device_id: "d1", platform: "x" },
        "sensor.p": { entity_id: "sensor.p", device_id: "d2", platform: "x" },
      },
    };
    expect(humidityOf(hass, "sensor.a_temperature")).toBeUndefined();
  });
});

describe("loadStats with outdoor data", () => {
  const now = new Date(2026, 9, 21, 12, 0).getTime();
  const today = new Date(2026, 9, 21).getTime();
  const ids: StatsEntities = {
    pump: "binary_sensor.pump",
    control: "sensor.control",
    climate: "climate.heating",
    trend: "sensor.trend",
    mode: "input_select.mode",
    leading: "input_select.leading",
    outdoor: "sensor.out",
    sensors: "sensor.sensors",
    warnings: {},
    targets: { target: "n.t", comfort: "n.c", eco: "n.e", frost_temp: "n.f" },
  };
  const hassOf = (outdoor: boolean): HomeAssistant =>
    ({
      states: {},
      async callWS(m: Record<string, unknown>) {
        const out: Record<string, unknown[]> = {};
        for (const id of m.entity_ids as string[]) {
          const lu = (t: number) => t / 1000;
          if (id === ids.pump) out[id] = [{ s: "off", lu: lu(today - DAY) }, { s: "on", lu: lu(today + HOUR) }, { s: "off", lu: lu(today + 3 * HOUR) }];
          else if (id === ids.control) out[id] = [{ s: "19", lu: lu(today) }];
          else if (id === ids.climate) out[id] = [{ s: "heat", lu: lu(today), a: { temperature: 20 } }];
          else if (id === ids.mode) out[id] = [{ s: "Comfort", lu: lu(today) }];
          else if (id === ids.leading) out[id] = [{ s: "Slaapkamer", lu: lu(today) }];
          else if (id === ids.outdoor) out[id] = outdoor ? [{ s: "8", lu: lu(today - 8 * DAY) }] : [];
          else out[id] = [];
        }
        return out;
      },
    }) as unknown as HomeAssistant;

  it("works out degree-days, the daily outdoor means and the time at target", async () => {
    const d = await loadStats(hassOf(true), ids, {}, "today", now);
    expect(d.degreeDays).toBeCloseTo(5, 3);
    expect(d.dayOutdoor).toHaveLength(7);
    expect(d.dayOutdoor.every((v) => v === 8)).toBe(true);
    expect(d.outdoor.length).toBeGreaterThan(0);
    expect(d.atTarget).toBe(0);
    expect(d.leaders).toEqual({ main: "Slaapkamer", others: 0 });
  });

  it("has no outdoor figures without the sensor, as before", async () => {
    const d = await loadStats(hassOf(false), { ...ids, outdoor: undefined }, {}, "today", now);
    expect(d.degreeDays).toBeUndefined();
    expect(d.outdoor).toEqual([]);
    expect(d.dayOutdoor.every((v) => v === undefined)).toBe(true);
  });

  it("turns a cluster of short runs into one warning inside the run events", async () => {
    const hass = {
      states: {},
      async callWS(m: Record<string, unknown>) {
        const out: Record<string, unknown[]> = {};
        for (const id of m.entity_ids as string[]) out[id] = [];
        // Four runs of three minutes, ten minutes apart, and one ordinary run of an hour.
        const rows: Array<{ s: string; lu: number }> = [{ s: "off", lu: (today - HOUR) / 1000 }];
        [60, 70, 80, 90].forEach((m0) => rows.push({ s: "on", lu: (today + m0 * MIN) / 1000 }, { s: "off", lu: (today + (m0 + 3) * MIN) / 1000 }));
        rows.push({ s: "on", lu: (today + 5 * HOUR) / 1000 }, { s: "off", lu: (today + 6 * HOUR) / 1000 });
        out[ids.pump] = rows;
        return out;
      },
    } as unknown as HomeAssistant;
    const d = await loadStats(hass, ids, {}, "today", now);
    const runs = d.events.filter((e) => e.kind === "run");
    expect(runs.map((e) => e.key).sort()).toEqual(["run", "short"]);
    expect(runs.find((e) => e.key === "short")?.count).toBe(4);
  });

  it("has no time at target for 30 days, where the thermostat history is not read", async () => {
    expect((await loadStats(hassOf(true), ids, {}, "month", now)).atTarget).toBeUndefined();
  });
});

describe("loadSeason", () => {
  const now = new Date(2026, 10, 2, 12, 0).getTime();
  const start = new Date(2026, 9, 1).getTime();
  const pumpRows = (from: number) => [{ s: "off", lu: from / 1000 }, { s: "on", lu: (now - 5 * HOUR) / 1000 }, { s: "off", lu: (now - 2 * HOUR) / 1000 }];

  function hass(statistics: "ok" | "none" | "fails", pumpFrom = start - DAY): HomeAssistant {
    return {
      states: {},
      async callWS(m: Record<string, unknown>) {
        if (m.type === "recorder/statistics_during_period") {
          if (statistics === "fails") throw new Error("x");
          if (statistics === "none") return {};
          const rows = [];
          for (let d = start; d < new Date(2026, 10, 2).getTime(); d = new Date(d).setHours(24, 0, 0, 0)) {
            rows.push({ start: statistics === "ok" && d % 2 ? new Date(d).toISOString() : d, mean: 8 });
          }
          return { "sensor.out": rows };
        }
        const id = (m.entity_ids as string[])[0];
        if (id === "binary_sensor.pump") return { [id]: pumpRows(pumpFrom) };
        return { [id]: [{ s: "8", lu: (start - DAY) / 1000 }] };
      },
    } as unknown as HomeAssistant;
  }

  it("adds pump time and degree-days from the season start, reading statistics in either time format", async () => {
    const s = await loadSeason(hass("ok"), "binary_sensor.pump", "sensor.out", start, now);
    expect(s?.from).toBe(start);
    expect(s?.pumpMs).toBe(3 * HOUR);
    // 32 finished days at 8° = 320, and half of today at 8° = 5.
    expect(s?.degreeDays).toBeCloseTo(32 * 10 + 5, 1);
  });

  it("falls back to the history when statistics are missing or fail", async () => {
    for (const mode of ["none", "fails"] as const) {
      const s = await loadSeason(hass(mode), "binary_sensor.pump", "sensor.out", start, now);
      expect(s?.degreeDays).toBeGreaterThan(300);
    }
  });

  it("starts on the first day the recorder has when it does not reach the season start", async () => {
    const late = new Date(2026, 9, 20, 8).getTime();
    const s = await loadSeason(hass("none", late), "binary_sensor.pump", "sensor.out", start, now);
    expect(s?.from).toBe(new Date(2026, 9, 21).getTime());
  });
});
