import type { ActionConfig } from "../../blocks/actions";
import type { LovelaceCardConfig } from "../../shared/types";

// How much the card shows: only a toggle, plus brightness, or plus temperature and colour.
export type LightControls = "toggle" | "brightness" | "color";

export interface LightCardConfig extends LovelaceCardConfig {
  entity?: string;
  name?: string;
  icon?: string;
  // Default: as much as the light supports. A light that can't do what is asked shows what it can.
  controls?: LightControls | "auto";
  // The state under the name ("On · 60%"). Default: shown.
  show_status?: boolean;
  // One row instead of a block: icon, name and a brightness slider. Colour stays one hold away, in more-info.
  compact?: boolean;
  // Only these effects, in this order. Default: all the light has.
  effects?: string[];
  // Default: toggle on tap, more-info on hold.
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
}

// One favourite colour, as the more-info dialog stores them: one shape per colour mode, never brightness.
export type LightColor =
  | { color_temp_kelvin: number }
  | { hs_color: [number, number] }
  | { rgb_color: [number, number, number] }
  | { rgbw_color: [number, number, number, number] }
  | { rgbww_color: [number, number, number, number, number] };

export const LIGHT_CONTROLS: LightControls[] = ["toggle", "brightness", "color"];

// A feature flag of the light entity.
export const EFFECT_FEATURE = 4;

// One lighting scene of the scene card: what to set on the lights, in the same terms as light.turn_on.
export interface LightPreset {
  name: string;
  icon?: string;
  // Switches the lights off instead; everything below is then ignored.
  off?: boolean;
  // Percent, 1 to 100.
  brightness?: number;
  color_temp_kelvin?: number;
  hs_color?: [number, number];
  rgb_color?: [number, number, number];
  effect?: string;
}

export interface LightSceneCardConfig extends LovelaceCardConfig {
  // One light or light group, or several lights that are set together.
  entity?: string;
  entities?: string[];
  // Shown above the scenes when set.
  name?: string;
  scenes?: LightPreset[];
  // Default: as many as fit.
  columns?: number;
}
