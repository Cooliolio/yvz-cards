import { describe, expect, it } from "vitest";
import {
  BULB,
  capabilities,
  defaultFavorites,
  favoriteActive,
  favoriteCss,
  forContrast,
  hsToRgb,
  inColorMode,
  lightColor,
  onColor,
  presetCall,
  presetCss,
  presetMatches,
  temperatureToRgb,
  toPercent,
} from "../src/cards/light/color";
import type { HassEntity } from "../src/shared/types";

const light = (attributes: Record<string, unknown>, state = "on"): HassEntity => ({
  entity_id: "light.test",
  state,
  attributes,
  last_changed: "",
  last_updated: "",
});

describe("what a light can do", () => {
  it("an on/off light has no brightness, temperature or colour", () => {
    expect(capabilities(light({ supported_color_modes: ["onoff"] }))).toEqual({ brightness: false, temperature: false, color: false, effects: [] });
  });

  it("a dimmable light has brightness only", () => {
    expect(capabilities(light({ supported_color_modes: ["brightness"] }))).toMatchObject({ brightness: true, temperature: false, color: false });
  });

  it("colour temperature counts as brightness plus temperature", () => {
    expect(capabilities(light({ supported_color_modes: ["color_temp"] }))).toMatchObject({ brightness: true, temperature: true, color: false });
  });

  it("every colour mode counts as colour, and a light can have temperature and colour", () => {
    for (const mode of ["hs", "xy", "rgb", "rgbw", "rgbww"]) {
      expect(capabilities(light({ supported_color_modes: [mode] }))).toMatchObject({ brightness: true, color: true });
    }
    expect(capabilities(light({ supported_color_modes: ["color_temp", "hs"] }))).toMatchObject({ temperature: true, color: true });
  });

  it("effects need the effect feature as well as a list", () => {
    const attributes = { supported_color_modes: ["rgb"], effect_list: ["Rainbow", "Pulse"] };
    expect(capabilities(light({ ...attributes, supported_features: 0 })).effects).toEqual([]);
    expect(capabilities(light({ ...attributes, supported_features: 4 })).effects).toEqual(["Rainbow", "Pulse"]);
    expect(capabilities(light({ ...attributes, supported_features: 4 | 32 })).effects).toEqual(["Rainbow", "Pulse"]);
  });

  it("nothing is known about an unavailable light", () => {
    expect(capabilities(light({}, "unavailable"))).toEqual({ brightness: false, temperature: false, color: false, effects: [] });
    expect(capabilities(undefined).brightness).toBe(false);
  });

  it("tells a colour mode from colour temperature", () => {
    expect(inColorMode(light({ color_mode: "hs" }))).toBe(true);
    expect(inColorMode(light({ color_mode: "color_temp" }))).toBe(false);
    expect(inColorMode(light({}))).toBe(false);
  });
});

describe("brightness", () => {
  it("converts 1 to 255 to a percent and never shows a lit light as 0", () => {
    expect(toPercent(255)).toBe(100);
    expect(toPercent(128)).toBe(50);
    expect(toPercent(1)).toBe(1);
    expect(toPercent(0)).toBeUndefined();
    expect(toPercent(undefined)).toBeUndefined();
  });
});

describe("colour conversion", () => {
  it("turns a temperature into the colour of that white", () => {
    expect(temperatureToRgb(2700)).toEqual([255, 167, 87]);
    expect(temperatureToRgb(6500)).toEqual([255, 254, 250]);
    const [warmR, , warmB] = temperatureToRgb(2000);
    const [coolR, , coolB] = temperatureToRgb(10000);
    expect(warmR).toBe(255);
    expect(warmB).toBeLessThan(coolB);
    expect(coolR).toBeLessThan(255);
  });

  it("converts hue and saturation", () => {
    expect(hsToRgb(0, 100)).toEqual([255, 0, 0]);
    expect(hsToRgb(120, 100)).toEqual([0, 255, 0]);
    expect(hsToRgb(240, 100)).toEqual([0, 0, 255]);
    expect(hsToRgb(0, 0)).toEqual([255, 255, 255]);
    expect(hsToRgb(360, 100)).toEqual(hsToRgb(0, 100));
  });

  it("keeps a strong colour, saturates a washed-out one, and greys a near-white one", () => {
    expect(forContrast([255, 0, 0])).toEqual([255, 0, 0]);
    const [r, g, b] = forContrast([255, 200, 200]);
    expect(r).toBe(255);
    expect(g).toBeLessThan(200);
    expect(b).toBeLessThan(200);
    expect(forContrast([255, 255, 255])).toEqual([225, 225, 225]);
  });
});

describe("the colour a light is drawn in", () => {
  it("uses its own colour in a colour mode", () => {
    expect(lightColor(light({ color_mode: "hs", rgb_color: [255, 0, 0] }))).toBe("rgb(255, 0, 0)");
  });

  it("uses the tint of its white in colour temperature mode", () => {
    expect(lightColor(light({ color_mode: "color_temp", color_temp_kelvin: 2700, rgb_color: [255, 167, 87] }))).toBe("rgb(255, 167, 87)");
  });

  it("falls back to the bulb yellow for a light that only dims or switches", () => {
    expect(lightColor(light({ color_mode: "brightness" }))).toBe(BULB);
    expect(lightColor(light({ color_mode: "onoff" }))).toBe(BULB);
    expect(lightColor(undefined)).toBe(BULB);
  });
});

describe("favourite colours", () => {
  it("offers four whites across the light's own range for a temperature light", () => {
    const favorites = defaultFavorites(light({ supported_color_modes: ["color_temp"], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500 }));
    expect(favorites).toEqual([{ color_temp_kelvin: 2000 }, { color_temp_kelvin: 3500 }, { color_temp_kelvin: 5000 }, { color_temp_kelvin: 6500 }]);
  });

  it("adds blue, purple, pink and red for a colour light", () => {
    const favorites = defaultFavorites(light({ supported_color_modes: ["color_temp", "hs"], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500 }));
    expect(favorites).toHaveLength(8);
    expect(favorites.slice(4)).toEqual([
      { rgb_color: [127, 172, 255] },
      { rgb_color: [215, 150, 255] },
      { rgb_color: [255, 158, 243] },
      { rgb_color: [255, 110, 84] },
    ]);
  });

  it("makes whites out of colour for a colour-only light", () => {
    const favorites = defaultFavorites(light({ supported_color_modes: ["rgb"] }));
    expect(favorites).toHaveLength(8);
    expect(favorites[0]).toHaveProperty("rgb_color");
  });

  it("has none for a light that only dims", () => {
    expect(defaultFavorites(light({ supported_color_modes: ["brightness"] }))).toEqual([]);
  });

  it("shows each favourite in its colour", () => {
    expect(favoriteCss({ rgb_color: [10, 20, 30] })).toBe("rgb(10, 20, 30)");
    expect(favoriteCss({ hs_color: [0, 100] })).toBe("rgb(255, 0, 0)");
    expect(favoriteCss({ color_temp_kelvin: 2700 })).toBe("rgb(255, 167, 87)");
  });

  it("marks the favourite the light is showing, within a small margin", () => {
    const warm = light({ color_mode: "color_temp", color_temp_kelvin: 2710 });
    expect(favoriteActive({ color_temp_kelvin: 2700 }, warm)).toBe(true);
    expect(favoriteActive({ color_temp_kelvin: 4000 }, warm)).toBe(false);
    const red = light({ color_mode: "hs", rgb_color: [255, 108, 80], hs_color: [10, 70] });
    expect(favoriteActive({ rgb_color: [255, 110, 84] }, red)).toBe(true);
    expect(favoriteActive({ rgb_color: [127, 172, 255] }, red)).toBe(false);
    expect(favoriteActive({ hs_color: [12, 72] }, red)).toBe(true);
  });

  it("never marks a colour favourite while the light is in colour temperature mode", () => {
    const white = light({ color_mode: "color_temp", color_temp_kelvin: 3000, rgb_color: [255, 180, 107] });
    expect(favoriteActive({ rgb_color: [255, 180, 107] }, white)).toBe(false);
  });
});

describe("text on the light's colour", () => {
  it("is dark on light fills and white on dark ones", () => {
    expect(onColor([255, 200, 87])).toBe("#1c1c1e");
    expect(onColor([225, 225, 225])).toBe("#1c1c1e");
    expect(onColor([255, 255, 255])).toBe("#1c1c1e");
    expect(onColor([0, 0, 255])).toBe("#fff");
    expect(onColor([200, 30, 30])).toBe("#fff");
    expect(onColor([20, 20, 20])).toBe("#fff");
  });
});

describe("lighting scenes", () => {
  const living = (attributes: Record<string, unknown>, state = "on") =>
    light({ supported_color_modes: ["color_temp", "hs"], effect_list: ["Rainbow", "Candle"], supported_features: 4, ...attributes }, state);

  it("turns a scene into a light.turn_on call", () => {
    expect(presetCall({ name: "x", brightness: 60, color_temp_kelvin: 2700 })).toEqual({
      service: "turn_on",
      data: { color_temp_kelvin: 2700, brightness_pct: 60 },
    });
    expect(presetCall({ name: "x", hs_color: [10, 50], effect: "Rainbow" }).data).toEqual({ hs_color: [10, 50], effect: "Rainbow" });
    expect(presetCall({ name: "x", off: true, brightness: 50 })).toEqual({ service: "turn_off", data: {} });
  });

  it("shows a scene in its colour, the bulb colour without one, and nothing for off", () => {
    expect(presetCss({ name: "x", color_temp_kelvin: 2700 })).toBe("rgb(255, 167, 87)");
    expect(presetCss({ name: "x", brightness: 20 })).toBe(BULB);
    expect(presetCss({ name: "x", off: true })).toBeUndefined();
  });

  it("matches a light that shows the scene, within a few percent of brightness", () => {
    const now = living({ color_mode: "color_temp", color_temp_kelvin: 2705, brightness: 153 });
    expect(presetMatches({ name: "x", brightness: 60, color_temp_kelvin: 2700 }, now)).toBe(true);
    expect(presetMatches({ name: "x", brightness: 62, color_temp_kelvin: 2700 }, now)).toBe(true);
    expect(presetMatches({ name: "x", brightness: 80, color_temp_kelvin: 2700 }, now)).toBe(false);
    expect(presetMatches({ name: "x", brightness: 60, color_temp_kelvin: 4000 }, now)).toBe(false);
  });

  it("matches an effect, and a missing effect counts as none", () => {
    const running = living({ color_mode: "hs", rgb_color: [255, 0, 0], hs_color: [0, 100], brightness: 255, effect: "Rainbow" });
    expect(presetMatches({ name: "x", effect: "rainbow" }, running)).toBe(true);
    expect(presetMatches({ name: "x", effect: "Candle" }, running)).toBe(false);
    expect(presetMatches({ name: "x", effect: "none" }, living({ color_mode: "hs", brightness: 255 }))).toBe(true);
  });

  it("only checks what the light can do", () => {
    const dimmable = light({ supported_color_modes: ["brightness"], color_mode: "brightness", brightness: 128 });
    expect(presetMatches({ name: "x", brightness: 50, color_temp_kelvin: 2700, effect: "Rainbow" }, dimmable)).toBe(true);
    const switchOnly = light({ supported_color_modes: ["onoff"] });
    expect(presetMatches({ name: "x", brightness: 50, hs_color: [1, 1] }, switchOnly)).toBe(true);
  });

  it("off matches an off light, and nothing else matches one", () => {
    const off = living({}, "off");
    expect(presetMatches({ name: "x", off: true }, off)).toBe(true);
    expect(presetMatches({ name: "x", brightness: 50 }, off)).toBe(false);
    expect(presetMatches({ name: "x", off: true }, living({ brightness: 100 }))).toBe(false);
  });
});
