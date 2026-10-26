import type { LovelaceCardConfig } from "../../shared/types";

// Integrations whose entities the card knows how to find.
export const TESLA_PLATFORMS = ["tesla_fleet", "teslemetry"];

interface EntitySpec {
  domain: string;
  // How the integration names the entity; this is what the card matches on.
  translationKey: string;
  // Entity id template for the `prefix` fallback.
  legacy: string;
  // Listed in the editor; the rest are only found automatically.
  editor: boolean;
}

const spec = (domain: string, translationKey: string, legacy: string, editor = true): EntitySpec => ({
  domain,
  translationKey,
  legacy,
  editor,
});

export const TESLA_ENTITIES = {
  battery: spec("sensor", "charge_state_battery_level", "sensor.{p}_battery_level"),
  range: spec("sensor", "charge_state_battery_range", "sensor.{p}_battery_range"),
  charging: spec("sensor", "charge_state_charging_state", "sensor.{p}_charging"),
  time_to_full: spec("sensor", "charge_state_minutes_to_full_charge", "sensor.{p}_time_to_full_charge"),
  charger_power: spec("sensor", "charge_state_charger_power", "sensor.{p}_charger_power"),
  energy_added: spec("sensor", "charge_state_charge_energy_added", "sensor.{p}_charge_energy_added"),
  charge_limit: spec("number", "charge_state_charge_limit_soc", "number.{p}_charge_limit"),
  cable: spec("binary_sensor", "charge_state_conn_charge_cable", "binary_sensor.{p}_charge_cable"),
  inside_temp: spec("sensor", "climate_state_inside_temp", "sensor.{p}_inside_temperature"),
  outside_temp: spec("sensor", "climate_state_outside_temp", "sensor.{p}_outside_temperature"),
  climate: spec("climate", "driver_temp", "climate.{p}_climate"),
  lock: spec("lock", "vehicle_state_locked", "lock.{p}_lock"),
  location: spec("device_tracker", "location", "device_tracker.{p}_location"),
  status: spec("binary_sensor", "state", "binary_sensor.{p}_status"),
  update: spec("update", "vehicle_state_software_update_status", "update.{p}_update"),
  charge_switch: spec("switch", "charge_state_charging_state", "switch.{p}_charge"),
  defrost: spec("switch", "climate_state_defrost_mode", "switch.{p}_defrost"),
  sentry: spec("switch", "vehicle_state_sentry_mode", "switch.{p}_sentry_mode"),
  seat_left: spec("select", "climate_state_seat_heater_left", "select.{p}_seat_heater_front_left"),
  seat_right: spec("select", "climate_state_seat_heater_right", "select.{p}_seat_heater_front_right"),
  steering: spec("select", "climate_state_steering_wheel_heat_level", "select.{p}_steering_wheel_heater"),
  charge_port: spec("cover", "charge_state_charge_port_door_open", "cover.{p}_charge_port_door"),
  frunk: spec("cover", "vehicle_state_ft", "cover.{p}_frunk"),
  trunk: spec("cover", "vehicle_state_rt", "cover.{p}_trunk"),
  windows: spec("cover", "windows", "cover.{p}_vent_windows"),
  flash: spec("button", "flash_lights", "button.{p}_flash_lights"),
  honk: spec("button", "honk", "button.{p}_honk_horn"),
  wake: spec("button", "wake", "button.{p}_wake"),
  tpms_fl: spec("binary_sensor", "vehicle_state_tpms_soft_warning_fl", "binary_sensor.{p}_tire_pressure_warning_front_left", false),
  tpms_fr: spec("binary_sensor", "vehicle_state_tpms_soft_warning_fr", "binary_sensor.{p}_tire_pressure_warning_front_right", false),
  tpms_rl: spec("binary_sensor", "vehicle_state_tpms_soft_warning_rl", "binary_sensor.{p}_tire_pressure_warning_rear_left", false),
  tpms_rr: spec("binary_sensor", "vehicle_state_tpms_soft_warning_rr", "binary_sensor.{p}_tire_pressure_warning_rear_right", false),
  door_df: spec("binary_sensor", "vehicle_state_df", "binary_sensor.{p}_front_driver_door", false),
  door_dr: spec("binary_sensor", "vehicle_state_dr", "binary_sensor.{p}_rear_driver_door", false),
  door_pf: spec("binary_sensor", "vehicle_state_pf", "binary_sensor.{p}_front_passenger_door", false),
  door_pr: spec("binary_sensor", "vehicle_state_pr", "binary_sensor.{p}_rear_passenger_door", false),
  win_fd: spec("binary_sensor", "vehicle_state_fd_window", "binary_sensor.{p}_front_driver_window", false),
  win_fp: spec("binary_sensor", "vehicle_state_fp_window", "binary_sensor.{p}_front_passenger_window", false),
  win_rd: spec("binary_sensor", "vehicle_state_rd_window", "binary_sensor.{p}_rear_driver_window", false),
  win_rp: spec("binary_sensor", "vehicle_state_rp_window", "binary_sensor.{p}_rear_passenger_window", false),
  shift: spec("sensor", "drive_state_shift_state", "sensor.{p}_shift_state", false),
  speed: spec("sensor", "drive_state_speed", "sensor.{p}_speed", false),
} satisfies Record<string, EntitySpec>;

export type TeslaEntityKey = keyof typeof TESLA_ENTITIES;

export const EDITOR_ENTITY_KEYS = (Object.keys(TESLA_ENTITIES) as TeslaEntityKey[]).filter(
  (key) => TESLA_ENTITIES[key].editor,
);

export const DOOR_KEYS: TeslaEntityKey[] = ["door_df", "door_dr", "door_pf", "door_pr"];
export const WINDOW_KEYS: TeslaEntityKey[] = ["win_fd", "win_fp", "win_rd", "win_rp"];
export const TPMS_KEYS: TeslaEntityKey[] = ["tpms_fl", "tpms_fr", "tpms_rl", "tpms_rr"];

export type ControlKind = "lock" | "toggle" | "cycle" | "cover" | "open_only" | "button";

export interface ControlDef {
  group: ControlGroup;
  kind: ControlKind;
  icon: string;
  // Needs a second tap to confirm.
  arm?: boolean;
  // Steps a select goes through, in order; options the car doesn't offer are skipped.
  options?: string[];
}

export type ControlGroup = "climate" | "charging" | "security" | "actions";

// Order the groups appear in the card.
export const CONTROL_GROUPS: ControlGroup[] = ["climate", "charging", "security", "actions"];

// Control tiles, listed by group in display order.
export const CONTROLS = {
  defrost: { group: "climate", kind: "toggle", icon: "mdi:car-defrost-front" },
  seat_left: { group: "climate", kind: "cycle", icon: "mdi:car-seat-heater", options: ["off", "low", "medium", "high"] },
  seat_right: { group: "climate", kind: "cycle", icon: "mdi:car-seat-heater", options: ["off", "low", "medium", "high"] },
  steering: { group: "climate", kind: "cycle", icon: "mdi:steering", options: ["off", "low", "high"] },
  charge_switch: { group: "charging", kind: "toggle", icon: "mdi:ev-station" },
  charge_port: { group: "charging", kind: "cover", icon: "mdi:ev-plug-type2", arm: true },
  lock: { group: "security", kind: "lock", icon: "mdi:lock", arm: true },
  sentry: { group: "security", kind: "toggle", icon: "mdi:shield-car" },
  frunk: { group: "security", kind: "open_only", icon: "mdi:car-select", arm: true },
  trunk: { group: "security", kind: "cover", icon: "mdi:car-back", arm: true },
  windows: { group: "security", kind: "cover", icon: "mdi:car-door", arm: true },
  flash: { group: "actions", kind: "button", icon: "mdi:car-light-high" },
  honk: { group: "actions", kind: "button", icon: "mdi:bullhorn", arm: true },
  wake: { group: "actions", kind: "button", icon: "mdi:sleep-off" },
} as const satisfies Record<string, ControlDef & { kind: ControlKind }>;

export type ControlKey = keyof typeof CONTROLS;

export const CONTROL_KEYS = Object.keys(CONTROLS) as ControlKey[];

export const DEFAULT_CONTROLS: ControlKey[] = [
  "lock",
  "defrost",
  "seat_left",
  "seat_right",
  "steering",
  "sentry",
  "charge_port",
  "frunk",
  "trunk",
  "flash",
];

export const PAINTS = {
  stealth_grey: { label: "Stealth Grey", hex: "#464a4f" },
  pearl_white: { label: "Pearl White", hex: "#e6e8ea" },
  quicksilver: { label: "Quicksilver", hex: "#a5a9ae" },
  diamond_black: { label: "Diamond Black", hex: "#1c1d20" },
  ultra_red: { label: "Ultra Red", hex: "#a5141c" },
  deep_blue: { label: "Deep Blue Metallic", hex: "#1f3b70" },
} as const;

export type PaintKey = keyof typeof PAINTS | "custom";

export type TeslaCardConfig = LovelaceCardConfig & {
  device_id?: string;
  name?: string;
  // Status only: no climate, charge limit or controls.
  compact?: boolean;
  paint?: PaintKey;
  paint_rgb?: [number, number, number];
  controls?: ControlKey[];
  show_climate?: boolean;
  show_charge_limit?: boolean;
  // Legacy: builds entity ids like sensor.model_3_battery_level.
  prefix?: string;
  entities?: Partial<Record<TeslaEntityKey, string>>;
};

// Car data older than this is flagged.
export const STALE_MINUTES = 180;
