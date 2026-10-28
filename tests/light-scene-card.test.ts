import { beforeEach, describe, expect, it, vi } from "vitest";
import "../src/cards/light-scene/yvz-light-scene-card";
import type { YvzLightSceneCard } from "../src/cards/light-scene/yvz-light-scene-card";
import type { HassEntity, HomeAssistant } from "../src/shared/types";

const light = (id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity => ({
  entity_id: id,
  state,
  attributes: { supported_color_modes: ["color_temp"], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500, ...attributes },
  last_changed: "",
  last_updated: "",
});

const warm = { color_mode: "color_temp", color_temp_kelvin: 2700, brightness: 153 };
const scenes = [
  { name: "Relax", brightness: 60, color_temp_kelvin: 2700 },
  { name: "Night", brightness: 5, color_temp_kelvin: 2200 },
  { name: "Off", off: true },
];

function make(states: HassEntity[], config: Record<string, unknown>) {
  const callService = vi.fn().mockResolvedValue(undefined);
  const hass = {
    states: Object.fromEntries(states.map((s) => [s.entity_id, s])),
    language: "en",
    locale: { language: "en" },
    callService,
    callWS: vi.fn(),
  } as unknown as HomeAssistant;
  const card = document.createElement("yvz-light-scene-card") as YvzLightSceneCard;
  card.setConfig({ type: "custom:yvz-light-scene-card", scenes, ...config });
  card.hass = hass;
  document.body.append(card);
  return { card, callService };
}

const tiles = (card: YvzLightSceneCard) => [...card.shadowRoot!.querySelectorAll("yvz-tile")] as Array<HTMLElement & { selected: boolean }>;

beforeEach(() => document.body.replaceChildren());

describe("yvz-light-scene-card", () => {
  it("shows a tile per scene and highlights the one the light shows", async () => {
    const { card } = make([light("light.a", "on", warm)], { entity: "light.a" });
    await card.updateComplete;
    expect(tiles(card).map((t) => t.selected)).toEqual([true, false, false]);
  });

  it("highlights Off for a light that is off", async () => {
    const { card } = make([light("light.a", "off")], { entity: "light.a" });
    await card.updateComplete;
    expect(tiles(card).map((t) => t.selected)).toEqual([false, false, true]);
  });

  it("applies a scene to the light", async () => {
    const { card, callService } = make([light("light.a", "on", warm)], { entity: "light.a" });
    await card.updateComplete;
    tiles(card)[1].click();
    expect(callService).toHaveBeenCalledWith("light", "turn_on", { entity_id: ["light.a"], color_temp_kelvin: 2200, brightness_pct: 5 });
    tiles(card)[2].click();
    expect(callService).toHaveBeenLastCalledWith("light", "turn_off", { entity_id: ["light.a"] });
  });

  it("sets several lights together, and highlights only when all of them agree", async () => {
    const { card, callService } = make([light("light.a", "on", warm), light("light.b", "on", warm)], { entities: ["light.a", "light.b"] });
    await card.updateComplete;
    expect(tiles(card)[0].selected).toBe(true);
    tiles(card)[1].click();
    expect(callService).toHaveBeenCalledWith("light", "turn_on", expect.objectContaining({ entity_id: ["light.a", "light.b"] }));

    document.body.replaceChildren();
    const split = make([light("light.a", "on", warm), light("light.b", "on", { ...warm, color_temp_kelvin: 4000 })], { entities: ["light.a", "light.b"] });
    await split.card.updateComplete;
    expect(tiles(split.card).some((t) => t.selected)).toBe(false);
  });

  it("ignores a light that is unavailable when judging which scene is on", async () => {
    const { card } = make([light("light.a", "on", warm), light("light.b", "unavailable")], { entities: ["light.a", "light.b"] });
    await card.updateComplete;
    expect(tiles(card)[0].selected).toBe(true);
  });

  it("says what is missing", async () => {
    const none = make([], {});
    await none.card.updateComplete;
    expect(none.card.shadowRoot!.querySelector(".empty")?.textContent).toContain("light");
    document.body.replaceChildren();
    const noScenes = make([light("light.a", "on")], { entity: "light.a", scenes: [] });
    await noScenes.card.updateComplete;
    expect(noScenes.card.shadowRoot!.querySelector(".empty")?.textContent).toContain("scenes");
  });

  it("renders with the properties Home Assistant sets on cards", async () => {
    const { card } = make([light("light.a", "on", warm)], { entity: "light.a" });
    (card as unknown as { preview: boolean }).preview = true;
    (card as unknown as { isPanel: boolean }).isPanel = true;
    await card.updateComplete;
    expect(tiles(card)).toHaveLength(3);
  });
});
