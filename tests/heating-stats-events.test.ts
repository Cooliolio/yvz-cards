import { describe, expect, it } from "vitest";
import { attachOrigin, changesOf, fetchLogbook, mergePresses, parseLogbook, personNames, type Changed } from "../src/cards/heating-stats/events";
import { loadStats, type StatsEntities } from "../src/cards/heating-stats/history";
import type { HassEntity, HomeAssistant } from "../src/shared/types";

const T0 = Date.parse("2026-11-01T12:00:00Z");
const MODE = "input_select.heating_mode";
const TARGET = "input_number.heating_target_temp";

const ev = (over: Partial<Changed> & { t: number }): Changed => ({ kind: "mode", key: "Off", entity: MODE, state: "Off", ...over });
const target = (t: number, v: number, over: Partial<Changed> = {}): Changed =>
  ({ t, kind: "target", key: "target", entity: TARGET, state: String(v), value: v, ...over }) as Changed;

describe("parseLogbook", () => {
  it("reads epoch seconds and ISO strings, and sorts", () => {
    const out = parseLogbook([
      { when: (T0 + 5000) / 1000, entity_id: MODE, state: "On", context_user_id: "u1" },
      { when: new Date(T0).toISOString(), entity_id: MODE, state: "Off" },
    ]);
    expect(out.map((e) => e.t)).toEqual([T0, T0 + 5000]);
    expect(out[1].userId).toBe("u1");
  });

  it("skips rows without time or entity, and anything that is not a list", () => {
    expect(parseLogbook([{ entity_id: MODE }, { when: 1 }, null])).toEqual([]);
    expect(parseLogbook(undefined)).toEqual([]);
    expect(parseLogbook({ error: true })).toEqual([]);
  });

  it("calls a change with an automation context and no user automatic, and names it", () => {
    const [a, b, c] = parseLogbook([
      { when: 1, entity_id: MODE, context_event_type: "automation_triggered", context_name: "Schedule" },
      { when: 2, entity_id: MODE, context_entity_id: "script.boost", context_entity_id_name: "Boost" },
      { when: 3, entity_id: MODE, context_event_type: "automation_triggered" },
    ]);
    expect(a.auto).toBe("Schedule");
    expect(b.auto).toBe("Boost");
    expect(c.auto).toBe("");
  });

  it("gives a user the change even when a script was the cause, and leaves a context-less change alone", () => {
    const [byScript, none] = parseLogbook([
      { when: 1, entity_id: MODE, context_user_id: "u1", context_domain: "script", context_entity_id: "script.x" },
      { when: 2, entity_id: MODE },
    ]);
    expect(byScript).toMatchObject({ userId: "u1", auto: undefined });
    expect(none).toMatchObject({ userId: undefined, auto: undefined });
  });
});

describe("personNames", () => {
  const person = (id: string, attributes: Record<string, unknown>) => ({ entity_id: id, state: "home", attributes }) as unknown as HassEntity;

  it("maps user ids to the friendly name, or the object id without one", () => {
    const names = personNames({
      "person.yasin": person("person.yasin", { user_id: "u1", friendly_name: "Yasin" }),
      "person.muz": person("person.muz", { user_id: "u2" }),
    });
    expect(names.get("u1")).toBe("Yasin");
    expect(names.get("u2")).toBe("muz");
  });

  it("ignores persons without a user and other domains", () => {
    const names = personNames({
      "person.guest": person("person.guest", { friendly_name: "Guest" }),
      "sensor.x": person("sensor.x", { user_id: "u3" }),
    });
    expect(names.size).toBe(0);
    expect(personNames(undefined).size).toBe(0);
  });
});

describe("attachOrigin", () => {
  const entry = (t: number, over = {}) => ({ t, entity: MODE, state: "Off", ...over });

  it("matches the same entity within two seconds", () => {
    const [e] = attachOrigin([ev({ t: T0 })], [entry(T0 + 1500, { userId: "u1" })]);
    expect(e.userId).toBe("u1");
  });

  it("does not match across entities, outside the tolerance, or on another state", () => {
    expect(attachOrigin([ev({ t: T0 })], [entry(T0 + 2500, { userId: "u1" })])[0].userId).toBeUndefined();
    expect(attachOrigin([ev({ t: T0 })], [entry(T0, { entity: TARGET, userId: "u1" })])[0].userId).toBeUndefined();
    expect(attachOrigin([ev({ t: T0 })], [entry(T0, { state: "On", userId: "u1" })])[0].userId).toBeUndefined();
  });

  it("compares numbers as numbers", () => {
    const [e] = attachOrigin([target(T0, 17.5)], [{ t: T0, entity: TARGET, state: "17.50", userId: "u1" }]);
    expect(e.userId).toBe("u1");
  });

  it("uses each logbook entry once and prefers the nearest", () => {
    const events = [ev({ t: T0 }), ev({ t: T0 + 1000 })];
    const out = attachOrigin(events, [entry(T0 + 900, { userId: "u1" })]);
    expect(out[0].userId).toBeUndefined();
    expect(out[1].userId).toBe("u1");
  });

  it("carries the automation across", () => {
    expect(attachOrigin([ev({ t: T0 })], [entry(T0, { auto: "Schedule" })])[0].auto).toBe("Schedule");
  });

  it("leaves an event without a logbook entry, or an empty logbook, as it was", () => {
    expect(attachOrigin([ev({ t: T0 })], [])).toEqual([ev({ t: T0 })]);
  });
});

describe("mergePresses", () => {
  it("turns a burst by one user into one event with the last value and time", () => {
    const burst = [17, 17.5, 18, 18.5, 19].map((v, i) => target(T0 + i * 20_000, v, { userId: "u1" }));
    const out = mergePresses(burst);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ t: T0 + 80_000, value: 19, count: 5 });
  });

  it("keeps a trail together while each gap stays within two minutes", () => {
    const out = mergePresses([0, 100, 200, 300].map((s, i) => target(T0 + s * 1000, 17 + i, { userId: "u1" })));
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe(20);
  });

  it("does not merge after a longer pause, other users, other helpers, or an automation", () => {
    expect(mergePresses([target(T0, 17, { userId: "u1" }), target(T0 + 121_000, 18, { userId: "u1" })])).toHaveLength(2);
    expect(mergePresses([target(T0, 17, { userId: "u1" }), target(T0 + 1000, 18, { userId: "u2" })])).toHaveLength(2);
    expect(mergePresses([target(T0, 17, { userId: "u1" }), { ...target(T0 + 1000, 21, { userId: "u1" }), entity: "input_number.heating_comfort_temp", key: "comfort" }])).toHaveLength(2);
    expect(mergePresses([target(T0, 17, { userId: "u1" }), target(T0 + 1000, 18, { auto: "Schedule" })])).toHaveLength(2);
  });

  it("merges presses nobody is known for, when the logbook has nothing", () => {
    expect(mergePresses([target(T0, 17), target(T0 + 1000, 18)])).toHaveLength(1);
  });

  it("never merges mode changes", () => {
    const out = mergePresses([ev({ t: T0, key: "Off" }), ev({ t: T0 + 1000, key: "On" })]);
    expect(out).toHaveLength(2);
  });
});

describe("changesOf", () => {
  const s = (t: number, v: string) => ({ t, s: v });

  it("drops the starting state and attribute-only repeats", () => {
    expect(changesOf([s(1, "Eco"), s(2, "Eco"), s(3, "On"), s(4, "On"), s(5, "Eco")]).map((c) => c.s)).toEqual(["On", "Eco"]);
  });

  it("remembers what it changed from", () => {
    expect(changesOf([s(1, "unavailable"), s(2, "17")])[0].from).toBe("unavailable");
  });
});

describe("fetchLogbook", () => {
  const hass = (callWS: HomeAssistant["callWS"]) => ({ callWS }) as unknown as HomeAssistant;

  it("asks once for the given entities", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const out = await fetchLogbook(hass(async (m) => (calls.push(m), [{ when: 1, entity_id: MODE }]) as never), [MODE, MODE, TARGET], 0, 1000);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ type: "logbook/get_events", entity_ids: [MODE, TARGET] });
    expect(out).toHaveLength(1);
  });

  it("comes back empty when the call fails or there is nothing to ask", async () => {
    expect(await fetchLogbook(hass(async () => Promise.reject(new Error("x"))), [MODE], 0, 1)).toEqual([]);
    expect(await fetchLogbook(hass(async () => [] as never), [], 0, 1)).toEqual([]);
  });
});

describe("loadStats events", () => {
  const now = Date.parse("2026-11-01T20:00:00Z");
  const ids: StatsEntities = {
    pump: "binary_sensor.heating_pump",
    control: "sensor.heating_control_temperature",
    climate: "climate.heating",
    trend: "sensor.heating_trend",
    mode: MODE,
    leading: "input_select.heating_leading_sensor",
    sensors: "sensor.heating_sensors",
    warnings: {},
    targets: {
      target: TARGET,
      comfort: "input_number.heating_comfort_temp",
      eco: "input_number.heating_eco_temp",
      frost_temp: "input_number.heating_frost_temp",
    },
  };
  const at = (min: number) => (now - min * 60_000) / 1000;

  function stub(logbook: "ok" | "empty" | "fails"): { hass: HomeAssistant; types: string[] } {
    const types: string[] = [];
    const hass = {
      states: {},
      async callWS(m: Record<string, unknown>) {
        types.push(String(m.type));
        if (m.type === "logbook/get_events") {
          if (logbook === "fails") throw new Error("nope");
          return logbook === "empty" ? [] : [{ when: at(60), entity_id: MODE, state: "Off", context_user_id: "u1" }];
        }
        const out: Record<string, unknown[]> = {};
        for (const id of m.entity_ids as string[]) {
          if (id === MODE) out[id] = [{ s: "Eco", lu: at(300) }, { s: "Eco", lu: at(200) }, { s: "Off", lu: at(60) }];
          else if (id === TARGET) out[id] = [{ s: "19", lu: at(300) }, { s: "17", lu: at(40) }, { s: "17.5", lu: at(39.5) }, { s: "18", lu: at(39) }];
          else out[id] = [];
        }
        return out;
      },
    } as unknown as HomeAssistant;
    return { hass, types };
  }

  it("lists mode and merged target changes with who did the mode change", async () => {
    const { hass } = stub("ok");
    const data = await loadStats(hass, ids, {}, "today", now);
    expect(data.events.map((e) => [e.kind, e.key, e.value])).toEqual([
      ["target", "target", 18],
      ["mode", "Off", undefined],
    ]);
    expect(data.events[1].userId).toBe("u1");
    expect(data.events[0].count).toBe(3);
  });

  it("shows the same events without names when the logbook is empty or fails", async () => {
    for (const mode of ["empty", "fails"] as const) {
      const data = await loadStats(stub(mode).hass, ids, {}, "today", now);
      expect(data.events).toHaveLength(2);
      expect(data.events.every((e) => e.userId === undefined)).toBe(true);
    }
  });

  it("skips the logbook with show_user off, and the targets with target_events off", async () => {
    const quiet = stub("ok");
    const data = await loadStats(quiet.hass, ids, {}, "today", now, { showUser: false, targetEvents: true });
    expect(quiet.types).not.toContain("logbook/get_events");
    expect(data.events[1].userId).toBeUndefined();

    const noTargets = await loadStats(stub("ok").hass, ids, {}, "today", now, { showUser: true, targetEvents: false });
    expect(noTargets.events.map((e) => e.kind)).toEqual(["mode"]);
  });
});
