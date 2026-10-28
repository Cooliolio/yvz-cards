import type { HassEntity } from "../../shared/types";
import type { LightColor, LightPreset } from "./types";

type Rgb = [number, number, number];

const COLOR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];
const BRIGHTNESS_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww", "color_temp", "brightness", "white"];

// The warm yellow of a lit bulb, for lights that have no colour of their own to show.
export const BULB = "rgb(255, 200, 87)";
const BULB_RGB: Rgb = [255, 200, 87];

export const DEFAULT_MIN_KELVIN = 2000;
export const DEFAULT_MAX_KELVIN = 6535;

const clamp = (n: number, lo = 0, hi = 255): number => Math.min(hi, Math.max(lo, n));

export interface Capabilities {
  brightness: boolean;
  temperature: boolean;
  color: boolean;
  effects: string[];
}

// What the light can do, from the modes it supports (not the one it is in right now).
export function capabilities(state?: HassEntity): Capabilities {
  const a = state?.attributes ?? {};
  const modes: string[] = Array.isArray(a.supported_color_modes) ? (a.supported_color_modes as string[]) : [];
  const effects = Array.isArray(a.effect_list) ? (a.effect_list as string[]) : [];
  return {
    brightness: modes.some((m) => BRIGHTNESS_MODES.includes(m)),
    temperature: modes.includes("color_temp"),
    color: modes.some((m) => COLOR_MODES.includes(m)),
    // The EFFECT feature flag is 4; a light without it ignores effects.
    effects: ((Number(a.supported_features) || 0) & 4) !== 0 ? effects : [],
  };
}

// The light is in a colour mode right now (not in colour temperature or only dimming).
export function inColorMode(state?: HassEntity): boolean {
  const mode = state?.attributes.color_mode;
  return typeof mode === "string" && COLOR_MODES.includes(mode);
}

// Brightness 1 to 255 as a percent; a light that is on never reads 0 %.
export function toPercent(brightness: unknown): number | undefined {
  const b = Number(brightness);
  return Number.isFinite(b) && b > 0 ? Math.max(Math.round((b * 100) / 255), 1) : undefined;
}

/* ---------- colour conversion ---------- */

// Kelvin to the colour of that white (a well-known approximation, good between 1000 and 40000 K).
export function temperatureToRgb(kelvin: number): Rgb {
  const t = kelvin / 100;
  const red = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const green = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const blue = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [Math.round(clamp(red)), Math.round(clamp(green)), Math.round(clamp(blue))];
}

export function hsToRgb(hue: number, saturation: number): Rgb {
  const s = saturation / 100;
  const h = (((hue % 360) + 360) % 360) / 60;
  const c = s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const m = 1 - c;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHsv([r, g, b]: Rgb): [number, number, number] {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}

function hsvToRgb(h: number, s: number, v: number): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round(r + m), Math.round(g + m), Math.round(b + m)];
}

// A pale or white light would vanish on a card, so, like the standard tile, a washed-out colour is given
// some saturation and a near-white one is shown as a light grey.
export function forContrast(rgb: Rgb): Rgb {
  const [h, s, v] = rgbToHsv(rgb);
  if (s >= 0.4) return rgb;
  return s < 0.1 ? hsvToRgb(h, s, 225) : hsvToRgb(h, 0.4, v);
}

const css = ([r, g, b]: Rgb): string => `rgb(${r}, ${g}, ${b})`;

// The colour the light shows in: its own colour, its white's tint, or the bulb yellow.
export function lightRgb(state?: HassEntity): Rgb {
  const a = state?.attributes ?? {};
  const mode = a.color_mode;
  const rgb = a.rgb_color;
  if (typeof mode === "string" && COLOR_MODES.includes(mode) && Array.isArray(rgb) && rgb.length === 3) {
    return forContrast(rgb.map(Number) as Rgb);
  }
  const kelvin = Number(a.color_temp_kelvin);
  if (mode === "color_temp" && Number.isFinite(kelvin) && kelvin > 0) return forContrast(temperatureToRgb(kelvin));
  return BULB_RGB;
}

export const lightColor = (state?: HassEntity): string => css(lightRgb(state));

export const cssRgb = css;

// Text that stays readable on a fill of this colour: dark on light fills, white on dark ones.
export function onColor([r, g, b]: Rgb): string {
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // white has the better contrast up to this luminance
  return luminance > 0.179 ? "#1c1c1e" : "#fff";
}

/* ---------- gradients for the sliders ---------- */

export function temperatureGradient(min: number, max: number): string {
  const stops = Array.from({ length: 6 }, (_, i) => css(temperatureToRgb(min + ((max - min) * i) / 5)));
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

export const HUE_GRADIENT = `linear-gradient(90deg, ${[0, 60, 120, 180, 240, 300, 360].map((h) => `hsl(${h} 100% 50%)`).join(", ")})`;

export const saturationGradient = (hue: number): string => `linear-gradient(90deg, #fff, hsl(${Math.round(hue)} 100% 50%))`;

/* ---------- favourite colours ---------- */

// What the more-info dialog offers before you pick your own: four whites across the light's range, and for
// colour lights blue, purple, pink and red.
export function defaultFavorites(state?: HassEntity): LightColor[] {
  const a = state?.attributes ?? {};
  const caps = capabilities(state);
  const out: LightColor[] = [];
  if (caps.temperature) {
    const min = Number(a.min_color_temp_kelvin) || DEFAULT_MIN_KELVIN;
    const max = Number(a.max_color_temp_kelvin) || DEFAULT_MAX_KELVIN;
    const step = (max - min) / 3;
    for (let i = 0; i < 4; i++) out.push({ color_temp_kelvin: Math.round(min + step * i) });
  } else if (caps.color) {
    for (let i = 0; i < 4; i++) out.push({ rgb_color: temperatureToRgb(2000 + ((6500 - 2000) / 3) * i) });
  }
  if (caps.color) {
    out.push({ rgb_color: [127, 172, 255] }, { rgb_color: [215, 150, 255] }, { rgb_color: [255, 158, 243] }, { rgb_color: [255, 110, 84] });
  }
  return out;
}

export function favoriteCss(favorite: LightColor): string {
  if ("color_temp_kelvin" in favorite) return css(temperatureToRgb(favorite.color_temp_kelvin));
  if ("hs_color" in favorite) return css(hsToRgb(...favorite.hs_color));
  const channels = Object.values(favorite)[0] as number[];
  return css([channels[0], channels[1], channels[2]]);
}

export function favoriteLabel(favorite: LightColor): string {
  return "color_temp_kelvin" in favorite ? `${favorite.color_temp_kelvin} K` : favoriteCss(favorite);
}

// Whether the light is showing this favourite right now, so the active one can be marked.
export function favoriteActive(favorite: LightColor, state?: HassEntity): boolean {
  const a = state?.attributes ?? {};
  if ("color_temp_kelvin" in favorite) {
    return a.color_mode === "color_temp" && Math.abs(Number(a.color_temp_kelvin) - favorite.color_temp_kelvin) <= 50;
  }
  if (!inColorMode(state)) return false;
  if ("hs_color" in favorite) {
    const hs = a.hs_color as number[] | undefined;
    return !!hs && Math.abs(hs[0] - favorite.hs_color[0]) <= 3 && Math.abs(hs[1] - favorite.hs_color[1]) <= 5;
  }
  const mine = Object.values(favorite)[0] as number[];
  const now = (a.rgb_color as number[] | undefined)?.slice(0, 3);
  return !!now && mine.slice(0, 3).every((c, i) => Math.abs(c - now[i]) <= 12);
}

/* ---------- scenes ---------- */

const presetColor = (p: LightPreset): LightColor | undefined =>
  p.color_temp_kelvin !== undefined
    ? { color_temp_kelvin: p.color_temp_kelvin }
    : p.hs_color
      ? { hs_color: p.hs_color }
      : p.rgb_color
        ? { rgb_color: p.rgb_color }
        : undefined;

// What a scene looks like on its tile: its colour, the bulb yellow if it sets none, nothing if it switches off.
export function presetCss(p: LightPreset): string | undefined {
  if (p.off) return undefined;
  const color = presetColor(p);
  return color ? favoriteCss(color) : BULB;
}

// How the scene is applied to the lights.
export function presetCall(p: LightPreset): { service: "turn_on" | "turn_off"; data: Record<string, unknown> } {
  if (p.off) return { service: "turn_off", data: {} };
  const data: Record<string, unknown> = { ...presetColor(p) };
  if (p.brightness !== undefined) data.brightness_pct = p.brightness;
  if (p.effect) data.effect = p.effect;
  return { service: "turn_on", data };
}

// Whether this light is showing the scene right now: brightness within a few percent, the colour, the effect.
export function presetMatches(p: LightPreset, state?: HassEntity): boolean {
  if (!state) return false;
  if (p.off) return state.state === "off";
  if (state.state !== "on") return false;
  const caps = capabilities(state);
  if (p.brightness !== undefined && caps.brightness) {
    const now = toPercent(state.attributes.brightness);
    if (now === undefined || Math.abs(now - p.brightness) > 3) return false;
  }
  const color = presetColor(p);
  if (color && (caps.temperature || caps.color) && !favoriteActive(color, state)) return false;
  if (p.effect && caps.effects.length) {
    const now = typeof state.attributes.effect === "string" ? state.attributes.effect : "none";
    if (now.toLowerCase() !== p.effect.toLowerCase()) return false;
  }
  return true;
}
