import { CONTROLS, type ControlKey, type TeslaCardConfig } from "./types";

// What the user picked in the card's settings view. Stored in this browser only, since a card
// can't write its own dashboard config. Anything not picked falls back to the card config.
export interface TeslaPrefs {
  controls?: ControlKey[];
  climate?: boolean;
  limit?: boolean;
}

const storageKey = (config: TeslaCardConfig): string =>
  `yvz-tesla-card:${config.device_id ?? config.prefix ?? "default"}`;

export function loadPrefs(config: TeslaCardConfig): TeslaPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(config)) ?? "{}") as TeslaPrefs;
    return {
      controls: Array.isArray(raw.controls) ? raw.controls.filter((k) => k in CONTROLS) : undefined,
      climate: typeof raw.climate === "boolean" ? raw.climate : undefined,
      limit: typeof raw.limit === "boolean" ? raw.limit : undefined,
    };
  } catch {
    return {};
  }
}

export function savePrefs(config: TeslaCardConfig, prefs: TeslaPrefs): void {
  try {
    const empty = !prefs.controls && prefs.climate === undefined && prefs.limit === undefined;
    if (empty) localStorage.removeItem(storageKey(config));
    else localStorage.setItem(storageKey(config), JSON.stringify(prefs));
  } catch {
    // Private mode or blocked storage: the choice just lasts until the page reloads.
  }
}
