import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/cards/tesla/yvz-tesla-card";
import type { YvzTeslaCard } from "../src/cards/tesla/yvz-tesla-card";
import { TESLA_ENTITIES, type TeslaEntityKey } from "../src/cards/tesla/types";
import type { HassEntity, HomeAssistant } from "../src/shared/types";

const DEVICE = "car";
const KEYS: TeslaEntityKey[] = ["battery", "status", "lock", "trunk", "frunk", "flash", "honk", "wake", "location"];
const id = (key: TeslaEntityKey) => `${TESLA_ENTITIES[key].domain}.car_${key}`;

const registry = Object.fromEntries(
  KEYS.map((key) => [
    id(key),
    { entity_id: id(key), device_id: DEVICE, platform: "tesla_fleet", translation_key: TESLA_ENTITIES[key].translationKey },
  ]),
);

const ent = (key: TeslaEntityKey, state: string, at = Date.now()): HassEntity => {
  const when = new Date(at).toISOString();
  return { entity_id: id(key), state, attributes: {}, last_changed: when, last_updated: when, last_reported: when };
};

interface Car {
  status: string;
  lock: string;
  trunk: string;
  batteryAt: number;
}

const states = (car: Car) =>
  Object.fromEntries(
    [
      ent("battery", "64", car.batteryAt),
      ent("status", car.status),
      ent("lock", car.lock),
      ent("trunk", car.trunk),
      ent("frunk", "closed"),
      ent("flash", "unknown"),
      ent("honk", "unknown"),
      ent("wake", "unknown"),
      ent("location", "home"),
    ].map((e) => [e.entity_id, e]),
  );

let calls: Array<{ domain: string; service: string; data: Record<string, unknown> }>;
let answer: (domain: string, service: string) => Promise<unknown>;

const makeHass = (car: Car): HomeAssistant =>
  ({
    states: states(car),
    entities: registry,
    devices: { [DEVICE]: { name: "Tesla" } },
    language: "en",
    locale: { language: "en" },
    config: { time_zone: "UTC" },
    callService: (domain: string, service: string, data: Record<string, unknown>) => {
      calls.push({ domain, service, data });
      return answer(domain, service);
    },
    callWS: vi.fn().mockRejectedValue(new Error("no")),
  }) as unknown as HomeAssistant;

const base: Car = { status: "on", lock: "locked", trunk: "closed", batteryAt: Date.now() };

async function make(car: Partial<Car> = {}, config: Record<string, unknown> = {}) {
  const card = document.createElement("yvz-tesla-card") as YvzTeslaCard;
  card.setConfig({ type: "custom:yvz-tesla-card", device_id: DEVICE, controls: ["lock", "trunk", "flash", "honk"], ...config });
  card.hass = makeHass({ ...base, ...car });
  document.body.append(card);
  await card.updateComplete;
  return card;
}

const root = (card: YvzTeslaCard) => card.shadowRoot!;
const tile = (card: YvzTeslaCard, key: string) => root(card).querySelector<HTMLElement & { value: string }>(`yvz-tile[data-key="${key}"]`)!;
const press = async (card: YvzTeslaCard, key: string) => {
  tile(card, key).click();
  await card.updateComplete;
};
const subtitle = (card: YvzTeslaCard) => root(card).querySelector<HTMLElement & { subtitle: string }>("yvz-card-header")!.subtitle;
const text = (card: YvzTeslaCard, selector: string) => root(card).querySelector(selector)?.textContent?.trim() ?? "";
const commands = () => calls.filter((c) => c.domain !== "homeassistant");
const polls = () => calls.filter((c) => c.domain === "homeassistant");
const settle = async (card: YvzTeslaCard) => {
  await vi.advanceTimersByTimeAsync(0);
  await card.updateComplete;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
  document.body.replaceChildren();
  calls = [];
  answer = () => Promise.resolve();
  base.batteryAt = Date.now();
});

afterEach(() => vi.useRealTimers());

describe("live data", () => {
  it("shows a change of the car's state as soon as hass changes", async () => {
    const card = await make({ status: "off", batteryAt: Date.now() - 95 * 60_000 });
    expect(root(card).textContent).toContain("Asleep");
    expect(subtitle(card)).toContain("1 h 35 min ago");

    card.hass = makeHass({ ...base, status: "on", lock: "unlocked", batteryAt: Date.now() });
    await card.updateComplete;
    expect(root(card).textContent).not.toContain("Asleep");
    expect(root(card).textContent).toContain("Parked");
    expect(subtitle(card)).toContain("just now");
    expect(tile(card, "lock").value).toBe("Unlocked");
  });

  it("moves the 'ago' text along with the clock", async () => {
    const card = await make({ batteryAt: Date.now() });
    expect(subtitle(card)).toContain("just now");
    vi.setSystemTime(Date.now() + 5 * 60_000);
    vi.advanceTimersByTime(60_000);
    await card.updateComplete;
    expect(subtitle(card)).toContain("6 min ago");
  });
});

describe("feedback on a press", () => {
  it("shows Sending, then Done, and asks the car for fresh data", async () => {
    let finish!: () => void;
    answer = (domain) => (domain === "button" ? new Promise<void>((r) => (finish = r)) : Promise.resolve());
    const card = await make();
    await press(card, "flash");
    expect(commands()).toEqual([{ domain: "button", service: "press", data: { entity_id: id("flash") } }]);
    expect(tile(card, "flash").value).toBe("Sending…");
    expect(text(card, '[role="status"]')).toBe("Flash: sending…");

    finish();
    await settle(card);
    expect(tile(card, "flash").value).toBe("Done");
    expect(text(card, '[role="status"]')).toBe("Flash: done");

    vi.advanceTimersByTime(1500);
    await card.updateComplete;
    expect(tile(card, "flash").value).not.toBe("Done");
    expect(text(card, '[role="status"]')).toBe("");
  });

  it("ignores a second press while the first is out", async () => {
    answer = () => new Promise(() => {});
    const card = await make();
    await press(card, "flash");
    await press(card, "flash");
    expect(commands()).toHaveLength(1);
  });

  it("shows the reason when it fails, as an alert", async () => {
    answer = (domain) => (domain === "button" ? Promise.reject({ code: "home_assistant_error", message: "Vehicle unavailable" }) : Promise.resolve());
    const card = await make();
    await press(card, "honk");
    await settle(card);
    expect(tile(card, "honk").value).toBe("Failed");
    expect(text(card, '[role="alert"]')).toBe("Honk: failed. Vehicle unavailable");
    expect(text(card, ".notice")).toBe("Honk: failed. Vehicle unavailable");
  });

  it("says the car is waking when it was asleep, and shows a hint", async () => {
    answer = () => new Promise(() => {});
    const card = await make({ status: "off" });
    expect(text(card, ".sleep-note")).toContain("wakes it first");
    await press(card, "flash");
    expect(tile(card, "flash").value).toBe("Waking car…");
  });

  it("does not call a long wait a failure", async () => {
    answer = () => new Promise(() => {});
    const card = await make({ status: "off" });
    await press(card, "flash");
    vi.advanceTimersByTime(60_000);
    await card.updateComplete;
    expect(tile(card, "flash").value).toBe("No answer yet");
    expect(text(card, ".notice")).toBe("Flash: no answer yet, it may still work");
    expect(root(card).querySelector('[role="alert"]')?.textContent).toBe("");
  });
});

describe("refresh after a command", () => {
  it("polls the status and a data entity, and stops when the car reported", async () => {
    const card = await make();
    await press(card, "flash");
    vi.advanceTimersByTime(5000);
    expect(polls()).toEqual([
      { domain: "homeassistant", service: "update_entity", data: { entity_id: [id("status"), id("battery")] } },
    ]);
    // The car reports: online and a data entity newer than the press.
    card.hass = makeHass({ ...base, batteryAt: Date.now() + 1000 });
    await card.updateComplete;
    vi.advanceTimersByTime(60_000);
    expect(polls()).toHaveLength(1); // nothing after the news
  });

  it("keeps asking through the whole schedule while the car stays quiet", async () => {
    answer = () => Promise.resolve();
    const card = await make({ status: "off" });
    await press(card, "flash");
    vi.advanceTimersByTime(61_000);
    expect(polls().length).toBeGreaterThanOrEqual(4);
  });

  it("does nothing when refresh_after_command is false", async () => {
    const card = await make({}, { refresh_after_command: false });
    await press(card, "flash");
    vi.advanceTimersByTime(120_000);
    expect(polls()).toEqual([]);
  });

  it("clears every timer when the card is removed", async () => {
    answer = () => new Promise(() => {});
    const card = await make();
    await press(card, "flash");
    await press(card, "trunk");
    card.remove();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("confirming", () => {
  it("asks in a bar before opening the trunk and sends nothing yet", async () => {
    const card = await make();
    await press(card, "trunk");
    expect(commands()).toEqual([]);
    expect(text(card, ".confirm .question")).toBe("Open the trunk?");
    expect(tile(card, "trunk").value).toBe("Confirm below");
    expect(root(card).activeElement).toBe(root(card).querySelector(".confirm .cancel"));
  });

  it("sends when confirmed", async () => {
    const card = await make();
    await press(card, "trunk");
    root(card).querySelector<HTMLButtonElement>(".confirm .go")!.click();
    await card.updateComplete;
    expect(commands()).toEqual([{ domain: "cover", service: "open_cover", data: { entity_id: id("trunk") } }]);
    expect(root(card).querySelector(".confirm")).toBeNull();
  });

  it("says Cancelled and sends nothing when cancelled", async () => {
    const card = await make();
    await press(card, "trunk");
    root(card).querySelector<HTMLButtonElement>(".confirm .cancel")!.click();
    await card.updateComplete;
    expect(commands()).toEqual([]);
    expect(root(card).querySelector(".confirm")).toBeNull();
    expect(text(card, ".notice")).toBe("Trunk: Cancelled");
    expect(text(card, '[role="status"]')).toBe("Trunk: Cancelled");
  });

  it("cancels on Escape", async () => {
    const card = await make();
    await press(card, "trunk");
    root(card).querySelector(".confirm")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await card.updateComplete;
    expect(root(card).querySelector(".confirm")).toBeNull();
    expect(text(card, ".notice")).toBe("Trunk: Cancelled");
  });

  it("stays open, then cancels itself visibly after 30 s", async () => {
    const card = await make();
    await press(card, "trunk");
    vi.advanceTimersByTime(29_000);
    await card.updateComplete;
    expect(root(card).querySelector(".confirm")).not.toBeNull();
    vi.advanceTimersByTime(1000);
    await card.updateComplete;
    expect(root(card).querySelector(".confirm")).toBeNull();
    expect(text(card, ".notice")).toBe("Trunk: Cancelled");
    expect(commands()).toEqual([]);
  });

  it("closes the question when the car changed underneath it", async () => {
    const card = await make();
    await press(card, "trunk");
    card.hass = makeHass({ ...base, trunk: "open" });
    await card.updateComplete;
    expect(root(card).querySelector(".confirm")).toBeNull();
    expect(text(card, ".notice")).toBe("Trunk: Cancelled");
  });

  it("asks only to unlock; locking is one tap", async () => {
    const locked = await make({ lock: "locked" });
    await press(locked, "lock");
    expect(text(locked, ".confirm .question")).toBe("Unlock the car?");
    expect(commands()).toEqual([]);

    document.body.replaceChildren();
    const unlocked = await make({ lock: "unlocked" });
    await press(unlocked, "lock");
    expect(root(unlocked).querySelector(".confirm")).toBeNull();
    expect(commands()).toEqual([{ domain: "lock", service: "lock", data: { entity_id: id("lock") } }]);
  });

  it("sends flash and honk at once", async () => {
    const card = await make();
    await press(card, "honk");
    expect(commands()).toHaveLength(1);
    expect(root(card).querySelector(".confirm")).toBeNull();
  });

  it("tap mode: a second tap sends, and an ignored tile says Cancelled", async () => {
    const card = await make({}, { confirm: "tap" });
    await press(card, "trunk");
    expect(commands()).toEqual([]);
    expect(tile(card, "trunk").value).toBe("Tap again to open");
    expect(root(card).querySelector(".confirm")).toBeNull();
    await press(card, "trunk");
    expect(commands()).toHaveLength(1);

    document.body.replaceChildren();
    const lone = await make({}, { confirm: "tap" });
    await press(lone, "trunk");
    vi.advanceTimersByTime(4000);
    await lone.updateComplete;
    expect(text(lone, ".notice")).toBe("Trunk: Cancelled");
  });

  it('confirm: "none" sends at once', async () => {
    const card = await make({}, { confirm: "none" });
    await press(card, "trunk");
    expect(commands()).toHaveLength(1);
  });

  it("an old config without the new options asks with the bar", async () => {
    const card = await make();
    await press(card, "trunk");
    expect(root(card).querySelector(".confirm")).not.toBeNull();
  });
});
