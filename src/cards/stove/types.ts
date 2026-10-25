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
}

// Roles a user can assign to a status option in the editor.
export const STOVE_ROLES = ["off", "pending", "on", "standby", "error"] as const satisfies readonly YvzState[];
