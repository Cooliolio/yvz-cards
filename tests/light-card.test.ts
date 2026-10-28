import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/cards/light/yvz-light-card";
import type { YvzLightCard } from "../src/cards/light/yvz-light-card";
import type { HassEntity, HomeAssistant } from "../src/shared/types";

const light = (attributes: Record<string, unknown>, state = "on"): HassEntity => ({
  entity_id: "light.test",
  state,
  attributes: { friendly_name: "Test", ...attributes },
  last_changed: "",
  last_updated: "",
});

const colorLight = light({
  supported_color_modes: ["color_temp", "hs"],
  color_mode: "color_temp",
  brightness: 128,
  color_temp_kelvin: 3000,
  rgb_color: [255, 180, 107],
  min_color_temp_kelvin: 2000,
  max_color_temp_kelvin: 6500,
});

function make(entity: HassEntity, config: Record<string, unknown> = {}) {
  const callService = vi.fn().mockResolvedValue(undefined);
  const hass = {
    states: { "light.test": entity },
    language: "en",
    locale: { language: "en" },
    callService,
    callWS: vi.fn().mockRejectedValue(new Error("not admin")),
  } as unknown as HomeAssistant;
  const card = document.createElement("yvz-light-card") as YvzLightCard;
  card.setConfig({ type: "custom:yvz-light-card", entity: "light.test", ...config });
  card.hass = hass;
  document.body.append(card);
  return { card, callService };
}

const root = (card: YvzLightCard) => card.shadowRoot!;

beforeEach(() => {
  document.body.replaceChildren();
});

describe("yvz-light-card", () => {
  it("shows only the toggle for a light that switches", async () => {
    const { card } = make(light({ supported_color_modes: ["onoff"] }));
    await card.updateComplete;
    expect(root(card).querySelector("yvz-slider")).toBeNull();
    expect(root(card).querySelector(".status")?.textContent).toBe("On");
  });

  it("adds a brightness slider for a dimmable light and shows the percent", async () => {
    const { card } = make(light({ supported_color_modes: ["brightness"], brightness: 128 }));
    await card.updateComplete;
    expect(root(card).querySelectorAll("yvz-slider")).toHaveLength(1);
    expect(root(card).querySelector(".status")?.textContent).toBe("On · 50%");
  });

  it("shows brightness, mode, temperature and favourites for a colour light", async () => {
    const { card } = make(colorLight);
    await card.updateComplete;
    expect(root(card).querySelectorAll("yvz-slider")).toHaveLength(2);
    expect(root(card).querySelector("yvz-segmented")).not.toBeNull();
    expect(root(card).querySelector("yvz-swatches")).not.toBeNull();
  });

  it("holds the card to the controls asked for", async () => {
    const { card } = make(colorLight, { controls: "brightness" });
    await card.updateComplete;
    expect(root(card).querySelectorAll("yvz-slider")).toHaveLength(1);
    expect(root(card).querySelector("yvz-segmented")).toBeNull();
    const toggle = make(colorLight, { controls: "toggle" });
    await toggle.card.updateComplete;
    expect(root(toggle.card).querySelector("yvz-slider")).toBeNull();
  });

  it("does not offer more than the light can do", async () => {
    const { card } = make(light({ supported_color_modes: ["onoff"] }), { controls: "color" });
    await card.updateComplete;
    expect(root(card).querySelector("yvz-slider")).toBeNull();
  });

  it("closes the controls while the light is off", async () => {
    const { card } = make({ ...colorLight, state: "off" });
    await card.updateComplete;
    const collapse = root(card).querySelector(".collapse") as HTMLElement;
    expect(collapse.hasAttribute("data-open")).toBe(false);
    expect(collapse.hasAttribute("inert")).toBe(true);
    expect(root(card).querySelector(".status")?.textContent).toBe("Off");
  });

  it("sends brightness as a percent when the slider is let go", async () => {
    const { card, callService } = make(colorLight);
    await card.updateComplete;
    const slider = root(card).querySelector("yvz-slider")!;
    slider.dispatchEvent(new CustomEvent("yvz-change", { detail: { value: 70 } }));
    expect(callService).toHaveBeenCalledWith("light", "turn_on", { entity_id: "light.test", brightness_pct: 70 });
  });

  it("sends a favourite colour without brightness", async () => {
    const { card, callService } = make(colorLight);
    await card.updateComplete;
    root(card).querySelector("yvz-swatches")!.dispatchEvent(new CustomEvent("yvz-select", { detail: { index: 0 } }));
    expect(callService).toHaveBeenCalledWith("light", "turn_on", { entity_id: "light.test", color_temp_kelvin: 2000 });
  });

  it("makes text on the fill readable for a light colour", async () => {
    const yellow = light({ supported_color_modes: ["hs"], color_mode: "hs", rgb_color: [255, 220, 40], hs_color: [50, 85], brightness: 200 });
    const { card } = make(yellow);
    await card.updateComplete;
    expect((root(card).querySelector("ha-card") as HTMLElement).style.getPropertyValue("--yvz-on-state")).toBe("#1c1c1e");
    const blue = make(light({ supported_color_modes: ["hs"], color_mode: "hs", rgb_color: [20, 40, 255], hs_color: [235, 92], brightness: 200 }));
    await blue.card.updateComplete;
    expect((root(blue.card).querySelector("ha-card") as HTMLElement).style.getPropertyValue("--yvz-on-state")).toBe("#fff");
  });

  it("compact keeps brightness only", async () => {
    const { card } = make(colorLight, { compact: true });
    await card.updateComplete;
    expect(root(card).querySelector("ha-card")!.classList.contains("compact")).toBe(true);
    expect(root(card).querySelectorAll("yvz-slider")).toHaveLength(1);
    expect(root(card).querySelector("yvz-segmented")).toBeNull();
  });

  it("toggles on tap", async () => {
    const { card, callService } = make(colorLight);
    await card.updateComplete;
    (root(card).querySelector(".head") as HTMLElement).click();
    expect(callService).toHaveBeenCalledWith("homeassistant", "toggle", { entity_id: "light.test" });
  });

  it("renders with the properties Home Assistant sets on cards", async () => {
    for (const preview of [false, true]) {
      const { card } = make(colorLight);
      (card as unknown as { preview: boolean }).preview = preview;
      (card as unknown as { isPanel: boolean }).isPanel = true;
      await card.updateComplete;
      expect(root(card).querySelector("ha-card")).not.toBeNull();
    }
  });

  it("says so when the light is unavailable", async () => {
    const { card } = make(light({}, "unavailable"));
    await card.updateComplete;
    expect(root(card).querySelector(".status")?.textContent).toBe("Unavailable");
  });
});

describe("hold on a desktop", () => {
  it("right-click runs the hold action, and Shift+Enter does from the keyboard", async () => {
    const { card } = make(colorLight);
    await card.updateComplete;
    const events: unknown[] = [];
    card.addEventListener("hass-more-info", (e) => events.push((e as CustomEvent).detail));
    const head = root(card).querySelector(".head") as HTMLElement;
    head.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    head.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
    expect(events).toEqual([{ entityId: "light.test" }, { entityId: "light.test" }]);
  });

  it("a tap after a right-click still toggles", async () => {
    const { card, callService } = make(colorLight);
    await card.updateComplete;
    const head = root(card).querySelector(".head") as HTMLElement;
    head.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    head.click();
    expect(callService).toHaveBeenCalledWith("homeassistant", "toggle", { entity_id: "light.test" });
  });
});

describe("a slider keeps its value until the light reports it", () => {
  const hsLight = (hs: [number, number]) =>
    light({ supported_color_modes: ["color_temp", "hs"], color_mode: "hs", brightness: 128, hs_color: hs, rgb_color: [255, 0, 0], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500 });
  const reported = (card: YvzLightSceneLike, entity: HassEntity) => {
    card.hass = { ...card.hass!, states: { "light.test": entity } } as HomeAssistant;
  };
  type YvzLightSceneLike = YvzLightCard;
  const brightnessSlider = (card: YvzLightCard) => root(card).querySelector("yvz-slider") as HTMLElement & { value: number };
  const letGo = (slider: HTMLElement, value: number) => slider.dispatchEvent(new CustomEvent("yvz-change", { detail: { value } }));
  const settle = async (card: YvzLightCard) => {
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not show the old value while the light is slow to report", async () => {
    const { card } = make(colorLight);
    await card.updateComplete;
    letGo(brightnessSlider(card), 70);
    await settle(card);
    await vi.advanceTimersByTimeAsync(500);
    await card.updateComplete;
    expect(brightnessSlider(card).value).toBe(70);
    expect(root(card).querySelector(".status")?.textContent).toBe("On · 70%");

    reported(card, { ...colorLight, attributes: { ...colorLight.attributes, brightness: 179 } });
    await card.updateComplete;
    expect((card as unknown as { holds: Map<string, unknown> }).holds.size).toBe(0);
    expect(brightnessSlider(card).value).toBe(70);
  });

  it("keeps waiting when the light still reports the old value", async () => {
    const { card } = make(colorLight);
    await card.updateComplete;
    letGo(brightnessSlider(card), 70);
    await settle(card);
    reported(card, { ...colorLight, attributes: { ...colorLight.attributes } });
    await card.updateComplete;
    expect(brightnessSlider(card).value).toBe(70);
  });

  it("gives up after 3 seconds if the light never confirms", async () => {
    const { card } = make(colorLight);
    await card.updateComplete;
    letGo(brightnessSlider(card), 70);
    await settle(card);
    await vi.advanceTimersByTimeAsync(2900);
    await card.updateComplete;
    expect(brightnessSlider(card).value).toBe(70);
    await vi.advanceTimersByTimeAsync(200);
    await card.updateComplete;
    expect(brightnessSlider(card).value).toBe(50);
  });

  it("shows the real state at once when the call fails", async () => {
    const { card, callService } = make(colorLight);
    callService.mockRejectedValue(new Error("nope"));
    await card.updateComplete;
    letGo(brightnessSlider(card), 70);
    await settle(card);
    expect(brightnessSlider(card).value).toBe(50);
    expect(root(card).querySelector(".status")?.textContent).toBe("On · 50%");
  });

  it("a new drag during the wait takes over and is not cleared by the old timer", async () => {
    const { card } = make(colorLight);
    await card.updateComplete;
    const slider = brightnessSlider(card);
    letGo(slider, 70);
    await settle(card);
    await vi.advanceTimersByTimeAsync(1000);
    slider.dispatchEvent(new CustomEvent("yvz-input", { detail: { value: 85 } }));
    await vi.advanceTimersByTimeAsync(3500);
    await card.updateComplete;
    expect(brightnessSlider(card).value).toBe(85);
  });

  it("confirms colour temperature within 100 K, and not before the light has changed", async () => {
    const { card } = make(colorLight, { controls: "color" });
    await card.updateComplete;
    const sliders = () => [...root(card).querySelectorAll("yvz-slider")] as Array<HTMLElement & { value: number }>;
    letGo(sliders()[1], 4000);
    await settle(card);
    expect(sliders()[1].value).toBe(4000);
    // an old reading near the target (3000 is not) must not count, a changed one within tolerance does
    reported(card, { ...colorLight, attributes: { ...colorLight.attributes, color_temp_kelvin: 3500 } });
    await card.updateComplete;
    expect((card as unknown as { holds: Map<string, unknown> }).holds.size).toBe(1);
    reported(card, { ...colorLight, attributes: { ...colorLight.attributes, color_temp_kelvin: 3950 } });
    await card.updateComplete;
    expect((card as unknown as { holds: Map<string, unknown> }).holds.size).toBe(0);
  });

  it("holds hue and saturation together", async () => {
    const { card, callService } = make(hsLight([10, 50]), { controls: "color" });
    await card.updateComplete;
    const sliders = () => [...root(card).querySelectorAll("yvz-slider")] as Array<HTMLElement & { value: number }>;
    letGo(sliders()[1], 200);
    await settle(card);
    expect(callService).toHaveBeenCalledWith("light", "turn_on", { entity_id: "light.test", hs_color: [200, 50] });
    expect(sliders()[1].value).toBe(200);
    expect(sliders()[2].value).toBe(50);
    reported(card, hsLight([199, 50]));
    await card.updateComplete;
    expect((card as unknown as { holds: Map<string, unknown> }).holds.size).toBe(1);
    reported(card, hsLight([199, 49]));
    await card.updateComplete;
    expect((card as unknown as { holds: Map<string, unknown> }).holds.size).toBe(0);
  });
});
