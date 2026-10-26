import { TESLA_ENTITIES, type TeslaEntityKey } from "../src/cards/tesla/types";
import type { HassDevice, HassEntity, HassEntityRegistryEntry } from "../src/shared/types";

export type ControlValue = string | number | boolean;

export interface Control {
  key: string;
  label: string;
  type: "select" | "range" | "checkbox";
  value: ControlValue;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

export interface Scene {
  name: string;
  tag: string;
  width?: number;
  config: Record<string, unknown>;
  // More cards of the same type shown below the first, sharing its state.
  extra?: Record<string, unknown>[];
  controls: Control[];
  states(values: Record<string, ControlValue>): Record<string, HassEntity>;
  // For cards that look entities up in the registry instead of taking ids.
  registry?: { entities: Record<string, HassEntityRegistryEntry>; devices: Record<string, HassDevice> };
  // Lets service calls change the controls, standing in for HA automations.
  service?(
    domain: string,
    service: string,
    data: Record<string, unknown>,
    values: Record<string, ControlValue>,
  ): Record<string, ControlValue> | void;
}

const entity = (
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {},
  minutesAgo = 0,
): HassEntity => {
  const when = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return { entity_id, state, attributes, last_changed: when, last_updated: when };
};

const STOVE_OPTIONS = ["Uit", "Ontsteken", "Brandt", "Uitdoven", "Storing"];

const stove: Scene = {
  name: "Stove",
  tag: "yvz-stove-card",
  config: {
    type: "custom:yvz-stove-card",
    name: "Soba",
    status: "input_select.stove_status",
    temperature: "sensor.stove_temperature",
    power_sensor: "sensor.stove_power",
    state_map: { Uit: "off", Ontsteken: "pending", Brandt: "on", Uitdoven: "standby", Storing: "error" },
    actions: {
      power: "script.stove_power",
      temp_up: "script.stove_temp_up",
      temp_down: "script.stove_temp_down",
      fan_up: "script.stove_fan_up",
      fan_down: "script.stove_fan_down",
    },
  },
  controls: [
    { key: "status", label: "Status", type: "select", value: "Brandt", options: [...STOVE_OPTIONS, "unavailable"] },
    { key: "minutes", label: "Minutes in state", type: "range", value: 9, min: 0, max: 300, step: 1 },
    { key: "temperature", label: "Temperature", type: "range", value: 18.2, min: 5, max: 30, step: 0.1 },
    { key: "power", label: "Power (W)", type: "range", value: 39, min: 0, max: 1000, step: 1 },
  ],
  states(v) {
    const scripts = ["power", "temp_up", "temp_down", "fan_up", "fan_down"].map((a) =>
      entity(`script.stove_${a}`, "off"),
    );
    return Object.fromEntries(
      [
        entity("input_select.stove_status", String(v.status), { options: STOVE_OPTIONS }, Number(v.minutes)),
        entity("sensor.stove_temperature", String(v.temperature), { device_class: "temperature" }),
        entity("sensor.stove_power", String(v.power), { device_class: "power" }),
        ...scripts,
      ].map((e) => [e.entity_id, e]),
    );
  },
};

const gaugeControl = (key: string, label: string, value: number, min = 0, max = 100, step = 1): Control => ({
  key,
  label,
  type: "range",
  value,
  min,
  max,
  step,
});

const gauges: Scene = {
  name: "Gauges",
  tag: "yvz-gauge-gallery",
  width: 560,
  config: { type: "custom:yvz-gauge-gallery" },
  controls: [
    gaugeControl("cpu", "CPU", 23),
    gaugeControl("ram", "RAM", 78),
    gaugeControl("jellyfin", "Jellyfin", 41),
    gaugeControl("frigate", "Frigate", 12),
    gaugeControl("disk", "Disk", 96),
    gaugeControl("temp", "CPU temp", 58, 20, 100),
    gaugeControl("nvme", "NVMe temp", 47, 20, 100),
    gaugeControl("chipset", "Chipset temp", 72, 20, 100),
    gaugeControl("case", "Case temp", 36, 20, 80),
    gaugeControl("battery", "Battery", 30),
    gaugeControl("limit", "Slider", 80, 50, 100),
    gaugeControl("lvm", "local-lvm", 44),
    gaugeControl("rec", "Recordings", 71),
    gaugeControl("viewers", "Jellyfin viewers", 2, 0, 10),
    gaugeControl("detector", "Detector (ms)", 34, 0, 150),
    gaugeControl("fps", "Camera fps", 15, 0, 30),
    gaugeControl("rx", "Net down (MB/s)", 12, 0, 100),
    gaugeControl("tx", "Net up (MB/s)", 3, 0, 100),
    gaugeControl("read", "NVMe read (MB/s)", 45, 0, 500),
    gaugeControl("write", "NVMe write (MB/s)", 8, 0, 500),
    gaugeControl("backupAge", "Backup age (h)", 20, 0, 36),
    gaugeControl("boost", "Boost left (min)", 11, 0, 15),
    gaugeControl("heat", "Room temp", 19.2, 10, 30, 0.1),
    gaugeControl("heatTarget", "Target temp", 21, 10, 30, 0.5),
    gaugeControl("tank", "Pellet tank (kg)", 12.5, 0, 26, 0.5),
    gaugeControl("sys", "Storage system (GB)", 120, 0, 1000),
    gaugeControl("recgb", "Storage recordings (GB)", 310, 0, 1000),
    gaugeControl("media", "Storage media (GB)", 480, 0, 1000),
  ],
  states(v) {
    return Object.fromEntries(
      Object.keys(v).map((k) => [`sensor.demo_${k}`, entity(`sensor.demo_${k}`, String(v[k]))]),
    );
  },
};

const sensor = (id: string, state: string | number, unit: string, extra: Record<string, unknown> = {}) =>
  entity(id, String(state), { unit_of_measurement: unit, ...extra });

const GUESTS = [
  { prefix: "haos18_2", cpu: 6, mem: 41, disk: 11.4, days: 21 },
  { prefix: "octoprint", cpu: 3, mem: 28, disk: 5.2, days: 8 },
  { prefix: "dnd_game", cpu: 1, mem: 12, disk: 3.8, days: 29 },
  { prefix: "apiary", cpu: 2, mem: 18, disk: 2.2, days: 29 },
];

const host: Scene = {
  name: "Host",
  tag: "yvz-host-card",
  width: 520,
  config: {
    type: "custom:yvz-host-card",
    name: "pve",
    trend: true,
    status: "binary_sensor.pve_status",
    uptime: "sensor.pve_uptime",
    temperature: "sensor.pve_hw_package_id_0_temperature",
    cpu: "sensor.pve_cpu_usage",
    memory: "sensor.pve_memory_usage_percentage",
    temperatures: [
      { entity: "sensor.pve_hw_package_id_0_temperature", name: "CPU" },
      { entity: "sensor.pve_hw_composite_temperature", name: "NVMe", warn_at: 60, error_at: 75 },
      { entity: "sensor.pve_hw_pch_cannonlake_0_temperature", name: "Chipset" },
    ],
    disks: [
      { entity: "sensor.storage_local_storage_usage_percentage", name: "local" },
      { entity: "sensor.storage_local_lvm_storage_usage_percentage", name: "local-lvm" },
    ],
    network: { down: "sensor.pve_hw_enx_rx", up: "sensor.pve_hw_enx_tx" },
    disk_io: { read: "sensor.pve_hw_nvme0n1_disk_read", write: "sensor.pve_hw_nvme0n1_disk_write" },
    stats: [
      { entity: "sensor.pve_hw_cpu_fan_fan_speed", name: "Fan" },
      { entity: "sensor.pve_hw_battery_charge", name: "Battery" },
      { entity: "sensor.pve_last_backup", name: "Last backup" },
      { entity: "sensor.pve_backup_duration", name: "Backup duration" },
      { entity: "binary_sensor.pve_backup_status", name: "Backup status" },
    ],
    guests: [
      { prefix: "haos18_2", name: "HAOS", kind: "vm" },
      { prefix: "octoprint", name: "OctoPrint", kind: "container" },
      { prefix: "dnd_game", name: "dnd-game", kind: "container" },
      { prefix: "apiary", name: "apiary", kind: "container" },
    ],
  },
  controls: [
    { key: "status", label: "Status", type: "select", value: "on", options: ["on", "off", "unavailable"] },
    gaugeControl("days", "Uptime (days)", 28, 0, 90),
    gaugeControl("cpu", "CPU", 2),
    gaugeControl("ram", "RAM", 79),
    gaugeControl("tempCpu", "CPU temp", 41, 20, 100),
    gaugeControl("tempNvme", "NVMe temp", 47, 20, 100),
    gaugeControl("tempChipset", "Chipset temp", 72, 20, 100),
    gaugeControl("local", "Storage local", 22),
    gaugeControl("lvm", "Storage local-lvm", 83),
    gaugeControl("rx", "Net down (Mbit/s)", 0.1, 0, 100, 0.1),
    gaugeControl("tx", "Net up (Mbit/s)", 0.03, 0, 100, 0.01),
    gaugeControl("read", "Disk read (MB/s)", 0.06, 0, 500, 0.01),
    gaugeControl("write", "Disk write (MB/s)", 4, 0, 500, 0.1),
    {
      key: "guestOff",
      label: "Guest down",
      type: "select",
      value: "none",
      options: ["none", ...GUESTS.map((g) => g.prefix)],
    },
    gaugeControl("apiaryCpu", "apiary CPU", 2),
  ],
  states(v) {
    const day = 86_400_000;
    const iso = (days: number) => new Date(Date.now() - days * day).toISOString();
    const temp = (id: string, value: ControlValue) =>
      sensor(id, value as number, "°C", { device_class: "temperature" });
    const list = [
      entity("binary_sensor.pve_status", String(v.status), { device_class: "running" }),
      entity("sensor.pve_uptime", iso(Number(v.days)), { device_class: "uptime" }),
      sensor("sensor.pve_cpu_usage", v.cpu as number, "%"),
      sensor("sensor.pve_memory_usage_percentage", v.ram as number, "%"),
      temp("sensor.pve_hw_package_id_0_temperature", v.tempCpu),
      temp("sensor.pve_hw_composite_temperature", v.tempNvme),
      temp("sensor.pve_hw_pch_cannonlake_0_temperature", v.tempChipset),
      sensor("sensor.storage_local_storage_usage_percentage", v.local as number, "%"),
      sensor("sensor.storage_local_lvm_storage_usage_percentage", v.lvm as number, "%"),
      sensor("sensor.pve_hw_enx_rx", v.rx as number, "Mbit/s", { device_class: "data_rate" }),
      sensor("sensor.pve_hw_enx_tx", v.tx as number, "Mbit/s", { device_class: "data_rate" }),
      sensor("sensor.pve_hw_nvme0n1_disk_read", v.read as number, "MB/s", { device_class: "data_rate" }),
      sensor("sensor.pve_hw_nvme0n1_disk_write", v.write as number, "MB/s", { device_class: "data_rate" }),
      sensor("sensor.pve_hw_cpu_fan_fan_speed", 1500, "rpm"),
      sensor("sensor.pve_hw_battery_charge", 85, "%", { device_class: "battery" }),
      entity("sensor.pve_last_backup", new Date(Date.now() - 14 * 3_600_000).toISOString(), { device_class: "timestamp" }),
      sensor("sensor.pve_backup_duration", 1.65, "min", { device_class: "duration" }),
      entity("binary_sensor.pve_backup_status", "off", { device_class: "problem" }),
      ...GUESTS.flatMap((g) => [
        entity(`binary_sensor.${g.prefix}_status`, v.guestOff === g.prefix ? "off" : "on", {
          device_class: "running",
          friendly_name: `${g.prefix} Status`,
        }),
        sensor(`sensor.${g.prefix}_cpu_usage`, g.prefix === "apiary" ? (v.apiaryCpu as number) : g.cpu, "%"),
        sensor(`sensor.${g.prefix}_memory_usage_percentage`, g.mem, "%"),
        sensor(`sensor.${g.prefix}_disk_usage`, g.disk, "GiB", { device_class: "data_size" }),
        entity(`sensor.${g.prefix}_uptime`, iso(g.days), { device_class: "uptime" }),
      ]),
    ];
    return Object.fromEntries(list.map((e) => [e.entity_id, e]));
  },
};

const ROOMS = { Badkamer: "badkamer", Kelder: "kelder", Slaapkamer: "slaapkamer", Woonkamer: "woonkamer" };
const MODES = ["Off", "On", "Eco", "Comfort", "Boost"];
const NUMBERS: Record<string, string> = {
  "input_number.heating_target_temp": "target",
  "input_number.heating_comfort_temp": "comfort",
  "input_number.heating_eco_temp": "eco",
  "input_number.heating_frost_temp": "frostTemp",
  "input_number.heating_boost_minutes": "boostMinutes",
};

const heating: Scene = {
  name: "Heating",
  tag: "yvz-heating-card",
  width: 440,
  config: { type: "custom:yvz-heating-card" },
  controls: [
    { key: "mode", label: "Mode", type: "select", value: "Comfort", options: MODES },
    { key: "pump", label: "Pump running", type: "checkbox", value: true },
    gaugeControl("pumpMinutes", "Pump on for (min)", 25, 0, 240),
    { key: "offline", label: "Offline", type: "checkbox", value: false },
    { key: "leading", label: "Leading room", type: "select", value: "Woonkamer", options: Object.keys(ROOMS) },
    ...Object.entries(ROOMS).map(([name, id]) =>
      gaugeControl(id, `${name} (°C)`, { badkamer: 20.1, kelder: 6.5, slaapkamer: 17.2, woonkamer: 19.4 }[id]!, 0, 30, 0.1),
    ),
    gaugeControl("trend", "Trend (°C/h)", 0.4, -1.5, 1.5, 0.05),
    gaugeControl("target", "Manual target", 20, 5, 25, 0.5),
    gaugeControl("comfort", "Comfort", 21, 15, 25, 0.5),
    gaugeControl("eco", "Eco", 17, 10, 20, 0.5),
    { key: "frost", label: "Frost protection", type: "checkbox", value: true },
    gaugeControl("frostTemp", "Frost temp", 7, 5, 10, 0.5),
    gaugeControl("boostMinutes", "Boost duration", 60, 15, 180, 15),
    gaugeControl("boostLeft", "Boost left (min)", 45, 0, 180),
    { key: "beforeBoost", label: "Mode before boost", type: "select", value: "Eco", options: MODES.slice(0, 4) },
    { key: "noWarmup", label: "No warm-up", type: "checkbox", value: false },
    { key: "sensorProblem", label: "Sensor problem", type: "checkbox", value: false },
    { key: "lowBattery", label: "Low battery room", type: "select", value: "none", options: ["none", ...Object.keys(ROOMS)] },
    { key: "roomDown", label: "Room not reporting", type: "select", value: "none", options: ["none", ...Object.keys(ROOMS)] },
  ],
  states(v) {
    const n = (key: string) => Number(v[key]);
    const mode = String(v.mode);
    const setpoint =
      mode === "On" ? n("target") : mode === "Eco" ? n("eco") : mode === "Off" ? n("frostTemp") : n("comfort");
    const hvacOff = mode === "Off" && !v.frost;
    const number = (id: string, value: number, min: number, max: number, step: number, unit = "°C") =>
      entity(id, String(value), { min, max, step, unit_of_measurement: unit });
    const roomTemps = Object.entries(ROOMS).map(([name, id]) =>
      v.roomDown === name
        ? entity(`sensor.${id}_temperature`, "unavailable")
        : sensor(`sensor.${id}_temperature`, n(id), "°C", { device_class: "temperature" }),
    );
    const leading = ROOMS[v.leading as keyof typeof ROOMS];
    const list = [
      entity("climate.heating", v.offline ? "unavailable" : hvacOff ? "off" : "heat", {
        temperature: hvacOff ? null : setpoint,
        current_temperature: n(leading),
        min_temp: 5,
        max_temp: 25,
        target_temp_step: 0.5,
      }),
      entity("input_select.heating_mode", mode, { options: MODES }),
      number("input_number.heating_target_temp", n("target"), 5, 25, 0.5),
      number("input_number.heating_comfort_temp", n("comfort"), 15, 25, 0.5),
      number("input_number.heating_eco_temp", n("eco"), 10, 20, 0.5),
      number("input_number.heating_frost_temp", n("frostTemp"), 5, 10, 0.5),
      number("input_number.heating_boost_minutes", n("boostMinutes"), 15, 180, 15, "min"),
      entity("input_boolean.heating_frost_enabled", v.frost ? "on" : "off"),
      entity("timer.heating_boost", mode === "Boost" ? "active" : "idle", {
        duration: `${Math.floor(n("boostMinutes") / 60)}:${String(n("boostMinutes") % 60).padStart(2, "0")}:00`,
        finishes_at: mode === "Boost" ? new Date(Date.now() + n("boostLeft") * 60_000).toISOString() : undefined,
      }),
      entity("input_text.heating_mode_before_boost", String(v.beforeBoost)),
      entity("sensor.heating_sensors", String(roomTemps.length), {
        map: Object.fromEntries(Object.entries(ROOMS).map(([name, id]) => [name, `sensor.${id}_temperature`])),
      }),
      entity("input_select.heating_leading_sensor", String(v.leading), { options: Object.keys(ROOMS) }),
      sensor("sensor.heating_control_temperature", n(leading), "°C", { device_class: "temperature" }),
      sensor("sensor.heating_trend", n("trend"), "°C/h"),
      entity(
        "binary_sensor.heating_pump",
        v.offline ? "unavailable" : v.pump ? "on" : "off",
        { device_class: "running" },
        n("pumpMinutes"),
      ),
      entity("binary_sensor.heating_offline", v.offline ? "on" : "off", { device_class: "problem" }),
      entity("binary_sensor.heating_no_warm_up", v.noWarmup ? "on" : "off", { device_class: "problem" }),
      entity("binary_sensor.heating_sensor_problem", v.sensorProblem ? "on" : "off", { device_class: "problem" }),
      entity("binary_sensor.heating_sensor_battery_low", v.lowBattery === "none" ? "off" : "on", {
        device_class: "battery",
        low_sensors: v.lowBattery === "none" ? [] : [`${v.lowBattery} (2.1 V)`],
      }),
      ...roomTemps,
    ];
    return Object.fromEntries(list.map((e) => [e.entity_id, e]));
  },
  service(domain, service, data, v): Record<string, ControlValue> | void {
    const id = String(data.entity_id);
    if (service === "select_option" && id === "input_select.heating_mode") {
      const option = String(data.option);
      return option === "Boost"
        ? { mode: option, beforeBoost: MODES.slice(0, 4).includes(String(v.mode)) ? v.mode : "On", boostLeft: v.boostMinutes }
        : { mode: option };
    }
    if (service === "select_option" && id === "input_select.heating_leading_sensor") return { leading: String(data.option) };
    if (domain === "input_number" && NUMBERS[id]) return { [NUMBERS[id]]: Number(data.value) };
    if (domain === "input_boolean" && service === "toggle") return { frost: !v.frost };
  },
};

const TESLA_DEVICE = "tesla-device";
const TESLA_PREFIX = "oprit_tesla_model_3_";

// Object ids as the integration creates them for the Model 3; the card finds them by translation_key.
const TESLA_IDS: Partial<Record<TeslaEntityKey, string>> = {
  battery: "battery_level",
  range: "battery_range",
  charging: "charging",
  time_to_full: "time_to_full_charge",
  charger_power: "charger_power",
  energy_added: "charge_energy_added",
  charge_limit: "charge_limit",
  cable: "charge_cable",
  inside_temp: "inside_temperature",
  outside_temp: "outside_temperature",
  climate: "climate",
  lock: "lock",
  location: "location",
  status: "status",
  update: "update",
  charge_switch: "charge",
  defrost: "defrost",
  sentry: "sentry_mode",
  seat_left: "seat_heater_front_left",
  seat_right: "seat_heater_front_right",
  steering: "steering_wheel_heater",
  charge_port: "charge_port_door",
  frunk: "frunk",
  trunk: "trunk",
  windows: "windows",
  flash: "flash_lights",
  honk: "honk_horn",
  wake: "wake",
  tpms_fl: "tire_pressure_warning_front_left",
  door_df: "front_driver_door",
  door_dr: "rear_driver_door",
  door_pf: "front_passenger_door",
  door_pr: "rear_passenger_door",
  win_fd: "front_driver_window",
  win_fp: "front_passenger_window",
  win_rd: "rear_driver_window",
  win_rp: "rear_passenger_window",
  shift: "shift_state",
  speed: "speed",
};

const teslaId = (key: TeslaEntityKey) => `${TESLA_ENTITIES[key].domain}.${TESLA_PREFIX}${TESLA_IDS[key]}`;
const TESLA_KEYS = Object.keys(TESLA_IDS) as TeslaEntityKey[];

const teslaRegistry = {
  entities: Object.fromEntries(
    TESLA_KEYS.map((key) => [
      teslaId(key),
      {
        entity_id: teslaId(key),
        device_id: TESLA_DEVICE,
        platform: "tesla_fleet",
        translation_key: TESLA_ENTITIES[key].translationKey,
      },
    ]),
  ),
  devices: { [TESLA_DEVICE]: { name: "Tesla Model 3" } },
};

const HEAT = ["off", "low", "medium", "high"];
const teslaCheck = (key: string, label: string, value = false): Control => ({ key, label, type: "checkbox", value });
const teslaSelect = (key: string, label: string, value: string, options: string[]): Control => ({
  key,
  label,
  type: "select",
  value,
  options,
});

const tesla: Scene = {
  name: "Tesla",
  tag: "yvz-tesla-card",
  width: 440,
  config: { type: "custom:yvz-tesla-card", device_id: TESLA_DEVICE },
  extra: [{ type: "custom:yvz-tesla-card", device_id: TESLA_DEVICE, compact: true }],
  registry: teslaRegistry,
  controls: [
    teslaSelect("status", "Car", "on", ["on", "off", "unavailable"]),
    gaugeControl("age", "Last update (min ago)", 2, 0, 600),
    teslaSelect("location", "Location", "home", ["home", "not_home", "Work", "none"]),
    gaugeControl("battery", "Battery (%)", 64),
    gaugeControl("range", "Range (km)", 281, 0, 500),
    teslaSelect("charging", "Charging", "disconnected", ["disconnected", "stopped", "starting", "charging", "complete", "no_power"]),
    teslaCheck("cable", "Cable plugged in"),
    gaugeControl("power", "Charger power (kW)", 11, 0, 250, 0.1),
    gaugeControl("added", "Energy added (kWh)", 18.4, 0, 100, 0.1),
    gaugeControl("minutesToFull", "Time to full (min)", 80, 0, 600),
    gaugeControl("limit", "Charge limit (%)", 80, 50, 100),
    teslaSelect("climate", "Climate", "off", ["off", "heat_cool", "unavailable"]),
    gaugeControl("target", "Climate target (°C)", 21, 15, 28, 0.5),
    gaugeControl("inside", "Inside (°C)", 19, -10, 50),
    gaugeControl("outside", "Outside (°C)", 12, -20, 45),
    teslaSelect("lock", "Lock", "locked", ["locked", "unlocked"]),
    teslaCheck("sentry", "Sentry mode"),
    teslaCheck("defrost", "Defrost"),
    teslaSelect("seat_left", "Seat heater L", "off", HEAT),
    teslaSelect("seat_right", "Seat heater R", "off", HEAT),
    teslaSelect("steering", "Steering wheel heater", "off", HEAT.filter((h) => h !== "medium")),
    teslaSelect("charge_port", "Charge port", "closed", ["closed", "open"]),
    teslaSelect("frunk", "Frunk", "closed", ["closed", "open"]),
    teslaSelect("trunk", "Trunk", "closed", ["closed", "open"]),
    teslaSelect("windows", "Windows", "closed", ["closed", "open"]),
    teslaCheck("door", "Door open"),
    teslaCheck("tires", "Tyre pressure warning"),
    teslaCheck("update", "Update available"),
    teslaSelect("shift", "Gear", "p", ["p", "d", "r", "n"]),
    gaugeControl("speed", "Speed (km/h)", 50, 0, 160),
    gaugeControl("driveAge", "Gear and speed updated (min ago)", 0, 0, 60),
  ],
  states(v) {
    const n = (key: string) => Number(v[key]);
    const flag = (key: string) => (v[key] ? "on" : "off");
    const minutes = (key: string) => n(key) * 60_000;
    const driving = v.status === "on" && v.shift !== "p";
    const unit = (key: TeslaEntityKey, state: string | number, unitOfMeasurement: string) =>
      entity(teslaId(key), String(state), { unit_of_measurement: unitOfMeasurement });
    const list = [
      entity(teslaId("status"), String(v.status), { device_class: "connectivity" }),
      { ...unit("battery", n("battery"), "%"), last_updated: new Date(Date.now() - minutes("age")).toISOString() },
      unit("range", n("range"), "km"),
      entity(teslaId("charging"), String(v.charging)),
      entity(teslaId("cable"), flag("cable")),
      unit("charger_power", n("power"), "kW"),
      unit("energy_added", n("added"), "kWh"),
      entity(
        teslaId("time_to_full"),
        v.charging === "charging" ? new Date(Date.now() + minutes("minutesToFull")).toISOString() : "unknown",
        { device_class: "timestamp" },
      ),
      entity(teslaId("charge_limit"), String(v.limit), { min: 50, max: 100, step: 1, unit_of_measurement: "%" }),
      entity(teslaId("charge_switch"), v.charging === "charging" ? "on" : "off"),
      unit("inside_temp", n("inside"), "°C"),
      unit("outside_temp", n("outside"), "°C"),
      entity(teslaId("climate"), String(v.climate), {
        temperature: n("target"),
        min_temp: 15,
        max_temp: 28,
        target_temp_step: 0.5,
      }),
      entity(teslaId("lock"), String(v.lock)),
      entity(teslaId("sentry"), flag("sentry")),
      entity(teslaId("defrost"), flag("defrost")),
      entity(teslaId("seat_left"), String(v.seat_left), { options: HEAT }),
      entity(teslaId("seat_right"), String(v.seat_right), { options: HEAT }),
      entity(teslaId("steering"), String(v.steering), { options: ["off", "low", "high"] }),
      entity(teslaId("charge_port"), String(v.charge_port)),
      entity(teslaId("frunk"), String(v.frunk)),
      entity(teslaId("trunk"), String(v.trunk)),
      entity(teslaId("windows"), String(v.windows)),
      entity(teslaId("update"), flag("update")),
      entity(teslaId("tpms_fl"), flag("tires")),
      entity(teslaId("door_df"), flag("door")),
      entity(teslaId("door_dr"), "off"),
      entity(teslaId("door_pf"), "off"),
      entity(teslaId("door_pr"), "off"),
      ...(["win_fd", "win_fp", "win_rd", "win_rp"] as const).map((k) =>
        entity(teslaId(k), v.windows === "open" ? "on" : "off"),
      ),
      entity(teslaId("shift"), String(v.shift), {}, n("driveAge")),
      entity(teslaId("speed"), String(driving ? n("speed") : 0), { unit_of_measurement: "km/h" }, n("driveAge")),
      entity(teslaId("flash"), "unknown"),
      entity(teslaId("honk"), "unknown"),
      entity(teslaId("wake"), "unknown"),
      ...(v.location === "none" ? [] : [entity(teslaId("location"), String(v.location))]),
    ];
    return Object.fromEntries(list.map((e) => [e.entity_id, e]));
  },
  service(domain, service, data): Record<string, ControlValue> | void {
    const key = TESLA_KEYS.find((k) => teslaId(k) === data.entity_id);
    if (!key) return;
    if (domain === "lock") return { lock: service === "lock" ? "locked" : "unlocked" };
    if (domain === "switch" && key === "charge_switch") {
      return { charging: service === "turn_on" ? "charging" : "stopped" };
    }
    if (domain === "switch") return { [key]: service === "turn_on" };
    if (domain === "select") return { [key]: String(data.option) };
    if (domain === "cover") return { [key]: service === "open_cover" ? "open" : "closed" };
    if (domain === "number") return { limit: Number(data.value) };
    if (domain === "climate") {
      if (service === "set_temperature") return { target: Number(data.temperature) };
      return { climate: service === "turn_on" ? "heat_cool" : "off" };
    }
    if (domain === "button" && key === "wake") return { status: "on", age: 0 };
  },
};

export const scenes: Scene[] = [host, heating, tesla, stove, gauges];
