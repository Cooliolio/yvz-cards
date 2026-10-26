import type { YvzState } from "../../design";
import type { LovelaceCardConfig } from "../../shared/types";

export const STOVE_ACTIONS = ["power", "temp_up", "temp_down", "fan_up", "fan_down"] as const;
export type StoveAction = (typeof STOVE_ACTIONS)[number];

export interface StoveCardConfig extends LovelaceCardConfig {
  name?: string;
  status?: string;
  temperature?: string;
  power_sensor?: string;
  state_map?: Record<string, YvzState>;
  actions?: Partial<Record<StoveAction, string>>;
  // One row: power, name, status, temperature and the temperature buttons.
  compact?: boolean;
  // Optional extras; each line hides when its entity isn't set.
  // Average ignition time today, in minutes.
  ignition_avg?: string;
  // Failed ignitions today.
  failures_today?: string;
  // °C per hour while the stove burns, and while it is off or cooling down (shown as a drop).
  trend?: string;
  trend_off?: string;
  // Hours until the pellets run out, and the hours below which a refill chip shows (default 4).
  pellets_hours?: string;
  pellets_threshold?: number;
  // Watts above which an "off" stove is suspicious (default 150).
  power_threshold?: number;
}

// Roles a user can assign to a status option in the editor.
export const STOVE_ROLES = ["off", "pending", "on", "standby", "error"] as const satisfies readonly YvzState[];

export const DEFAULT_PELLET_HOURS = 4;
export const DEFAULT_POWER_THRESHOLD = 150;
// A burning stove that draws less than this is suspicious.
export const NEAR_ZERO_WATTS = 10;
// Ignition lasting this many times the average is flagged.
export const SLOW_IGNITION_FACTOR = 1.5;
// What "Duurt meestal …" falls back to without an average.
export const DEFAULT_IGNITION_MIN = 10;
