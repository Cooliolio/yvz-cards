import type { LovelaceCardConfig } from "../../shared/types";

// Entities the card reads; every one has a default matching heating.yaml.
export const HEATING_ENTITIES = {
  climate: "climate.heating",
  mode: "input_select.heating_mode",
  target: "input_number.heating_target_temp",
  comfort: "input_number.heating_comfort_temp",
  eco: "input_number.heating_eco_temp",
  boost_minutes: "input_number.heating_boost_minutes",
  boost_timer: "timer.heating_boost",
  before_boost: "input_text.heating_mode_before_boost",
  frost_enabled: "input_boolean.heating_frost_enabled",
  frost_temp: "input_number.heating_frost_temp",
  sensors: "sensor.heating_sensors",
  leading: "input_select.heating_leading_sensor",
  control: "sensor.heating_control_temperature",
  trend: "sensor.heating_trend",
  pump: "binary_sensor.heating_pump",
  offline: "binary_sensor.heating_offline",
  no_warmup: "binary_sensor.heating_no_warm_up",
  sensor_problem: "binary_sensor.heating_sensor_problem",
  battery_low: "binary_sensor.heating_sensor_battery_low",
} as const;

export type HeatingEntityKey = keyof typeof HEATING_ENTITIES;

// Options of the mode input_select, exactly as heating.yaml defines them.
export const HEATING_MODES = ["Off", "On", "Eco", "Comfort", "Boost"] as const;
export type HeatingMode = (typeof HEATING_MODES)[number];

export type HeatingCardConfig = LovelaceCardConfig & { name?: string; compact?: boolean } & Partial<
    Record<HeatingEntityKey, string>
  >;

// How the editor groups the entity overrides.
export const HEATING_GROUPS: Record<string, HeatingEntityKey[]> = {
  thermostat: ["climate", "mode", "target", "pump", "offline"],
  presets: ["comfort", "eco", "boost_minutes", "boost_timer", "before_boost"],
  frost: ["frost_enabled", "frost_temp"],
  sensors: ["sensors", "leading", "control", "trend", "sensor_problem", "no_warmup", "battery_low"],
};
