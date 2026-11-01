import type { LovelaceCardConfig } from "../../shared/types";

// Entities the card reads; every one has a default matching heating.yaml.
export const STATS_ENTITIES = {
  pump: "binary_sensor.heating_pump",
  control: "sensor.heating_control_temperature",
  climate: "climate.heating",
  trend: "sensor.heating_trend",
  mode: "input_select.heating_mode",
  sensors: "sensor.heating_sensors",
  leading: "input_select.heating_leading_sensor",
  offline: "binary_sensor.heating_offline",
  no_warmup: "binary_sensor.heating_no_warm_up",
  sensor_problem: "binary_sensor.heating_sensor_problem",
  battery_low: "binary_sensor.heating_sensor_battery_low",
  // The helpers the heating card changes; a change to one of them is listed as an event.
  target: "input_number.heating_target_temp",
  comfort: "input_number.heating_comfort_temp",
  eco: "input_number.heating_eco_temp",
  frost_temp: "input_number.heating_frost_temp",
} as const;

export const TARGET_KEYS = ["target", "comfort", "eco", "frost_temp"] as const;
export type TargetKey = (typeof TARGET_KEYS)[number];

// Optional long-term sensors (history_stats). Used when they exist, otherwise computed from history.
export const STATS_LONG_TERM = {
  runtime_today: "sensor.heating_pump_runtime_today",
  runtime_yesterday: "sensor.heating_pump_runtime_yesterday",
  runtime_week: "sensor.heating_pump_runtime_week",
  runtime_month: "sensor.heating_pump_runtime_month",
  starts_today: "sensor.heating_pump_starts_today",
  starts_yesterday: "sensor.heating_pump_starts_yesterday",
  starts_week: "sensor.heating_pump_starts_week",
  starts_month: "sensor.heating_pump_starts_month",
  runtime_season: "sensor.heating_pump_runtime_season",
  starts_season: "sensor.heating_pump_starts_season",
} as const;

export type StatsEntityKey = keyof typeof STATS_ENTITIES;
export type StatsLongTermKey = keyof typeof STATS_LONG_TERM;

export const PERIODS = ["today", "week", "month"] as const;
export type Period = (typeof PERIODS)[number];

// What today is compared with: yesterday up to the same time of day, or all of yesterday.
export type CompareMode = "same_time" | "full_day";

export type HeatingStatsConfig = LovelaceCardConfig & {
  name?: string;
  compact?: boolean;
  compare?: CompareMode;
  // Period shown first; the last one picked is remembered per card in this browser.
  period?: Period;
  // Names next to the events that someone changed (default true).
  show_user?: boolean;
  // Changes to the target, comfort, eco and frost temperatures as events (default true).
  target_events?: boolean;
  // The outdoor temperature sensor. Without it there is no outdoor line, no degree-days and no outdoor figure under the bars.
  outdoor?: string;
  // Where the season begins, "MM-DD" (default "10-01"); only the pump hours per degree-day of the season use it.
  season_start?: string;
} & Partial<Record<StatsEntityKey | StatsLongTermKey, string>>;

// How the editor groups the entity overrides.
export const STATS_GROUPS: Record<string, (StatsEntityKey | StatsLongTermKey)[]> = {
  heating: ["pump", "climate", "control", "trend", "mode"],
  rooms: ["sensors", "leading"],
  targets: [...TARGET_KEYS],
  warnings: ["offline", "no_warmup", "sensor_problem", "battery_low"],
  long_term: [
    "runtime_today",
    "runtime_yesterday",
    "runtime_week",
    "runtime_month",
    "starts_today",
    "starts_yesterday",
    "starts_week",
    "starts_month",
    "runtime_season",
    "starts_season",
  ],
};
