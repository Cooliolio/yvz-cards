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

// A named state of a scene: the same card with some entity values or settings changed.
export interface Preset {
  name: string;
  // Control values that differ from the scene's defaults.
  values?: Record<string, ControlValue>;
  // Replace the scene's card config, extra cards, width or panel height for this state.
  config?: Record<string, unknown>;
  extra?: Record<string, unknown>[];
  width?: number;
  height?: number;
}

export interface Scene {
  name: string;
  // Scenes are listed under their group.
  group?: "Cards" | "Design";
  // The states the scene can be switched between, besides its defaults.
  presets?: Preset[];
  tag: string;
  width?: number;
  // A fixed parent height, like a panel view.
  height?: number;
  config: Record<string, unknown>;
  // More cards of the same type shown below the first, sharing its state.
  extra?: Record<string, unknown>[];
  controls: Control[];
  states(values: Record<string, ControlValue>): Record<string, HassEntity>;
  // Fake history for a history/history_during_period call; return nothing to use the default.
  history?(
    message: Record<string, unknown>,
    values: Record<string, ControlValue>,
  ): Record<string, Array<Record<string, unknown>>> | undefined;
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

// The status history the card reads, built backwards from the status the controls ask for.
function stoveHistory(
  message: Record<string, unknown>,
  v: Record<string, ControlValue>,
): Record<string, Array<Record<string, unknown>>> {
  if (v.historyFails) throw new Error("history unavailable");
  const end = Date.parse(message.end_time as string);
  const start = Date.parse(message.start_time as string);
  const out: Record<string, Array<Record<string, unknown>>> = {};
  for (const id of message.entity_ids as string[]) {
    if (id === "sensor.stove_power") {
      out[id] = [{ lu: start / 1000, s: String(v.power) }];
      continue;
    }
    const min = (n: number) => n * 60_000;
    const now = end;
    const current = now - min(Number(v.minutes));
    const ignition = min(Number(v.ignitionMin));
    const status = String(v.status);
    let segments: Array<[number, string]>;
    if (status === "Brandt") {
      segments = [[current - ignition - min(180), "Uit"], [current - ignition, "Ontsteken"], [current, "Brandt"]];
    } else if (status === "Ontsteken") {
      segments = [[current - min(180), "Uit"], [current, "Ontsteken"]];
    } else if (status === "Uitdoven") {
      const burn = current - min(150);
      segments = [[burn - ignition - min(180), "Uit"], [burn - ignition, "Ontsteken"], [burn, "Brandt"], [current, "Uitdoven"]];
    } else if (status === "Storing") {
      segments = [[current - ignition - min(120), "Uit"], [current - ignition, "Ontsteken"], [current, "Storing"]];
    } else {
      const cooling = current - min(20);
      const burn = cooling - min(150);
      segments = [
        [burn - ignition - min(180), "Uit"],
        [burn - ignition, "Ontsteken"],
        [burn, "Brandt"],
        [cooling, "Uitdoven"],
        [current, "Uit"],
      ];
    }
    // History that starts in the middle of the current state, so nothing before it is known.
    if (v.noRunHistory) segments = [[current, status]];
    const before = segments.filter(([t]) => t <= start).pop();
    const inside = segments.filter(([t]) => t > start);
    out[id] = [...(before ? [[start, before[1]] as [number, string]] : []), ...inside].map(([t, state]) => ({ lu: t / 1000, s: state }));
  }
  return out;
}

const stove: Scene = {
  name: "Stove",
  tag: "yvz-stove-card",
  width: 440,
  config: {
    type: "custom:yvz-stove-card",
    name: "Soba",
    status: "input_select.stove_status",
    temperature: "sensor.stove_temperature",
    power_sensor: "sensor.stove_power",
    ignition_avg: "sensor.stove_avg_ignition",
    failures_today: "sensor.stove_failed_today",
    trend: "input_number.stove_heating_rate",
    trend_off: "input_number.stove_cooling_rate",
    pellets_hours: "sensor.stove_refill_in",
    state_map: { Uit: "off", Ontsteken: "pending", Brandt: "on", Uitdoven: "standby", Storing: "error" },
    actions: {
      power: "script.stove_power",
      temp_up: "script.stove_temp_up",
      temp_down: "script.stove_temp_down",
      fan_up: "script.stove_fan_up",
      fan_down: "script.stove_fan_down",
    },
  },
  extra: [
    {
      type: "custom:yvz-stove-card",
      compact: true,
      name: "Soba",
      status: "input_select.stove_status",
      temperature: "sensor.stove_temperature",
      state_map: { Uit: "off", Ontsteken: "pending", Brandt: "on", Uitdoven: "standby", Storing: "error" },
      actions: {
        power: "script.stove_power",
        temp_up: "script.stove_temp_up",
        temp_down: "script.stove_temp_down",
      },
    },
  ],
  history: stoveHistory,
  controls: [
    { key: "status", label: "Status", type: "select", value: "Brandt", options: [...STOVE_OPTIONS, "unavailable"] },
    { key: "minutes", label: "Minutes in state", type: "range", value: 134, min: 0, max: 300, step: 1 },
    { key: "ignitionMin", label: "Last ignition took (min)", type: "range", value: 9, min: 1, max: 30, step: 1 },
    { key: "avgIgnition", label: "Average ignition (min, 0 = none)", type: "range", value: 10, min: 0, max: 20, step: 1 },
    { key: "failures", label: "Failed ignitions today", type: "range", value: 1, min: 0, max: 5, step: 1 },
    { key: "temperature", label: "Temperature", type: "range", value: 22.4, min: 5, max: 30, step: 0.1 },
    { key: "heatRate", label: "Heating rate (°C/h)", type: "range", value: 1.2, min: 0, max: 3, step: 0.1 },
    { key: "coolRate", label: "Cooling rate (°C/h)", type: "range", value: 0.4, min: 0, max: 2, step: 0.1 },
    { key: "pellets", label: "Pellet hours left (-1 = no sensor)", type: "range", value: 12, min: -1, max: 24, step: 1 },
    { key: "power", label: "Power (W)", type: "range", value: 39, min: 0, max: 1000, step: 1 },
    { key: "noRunHistory", label: "History starts mid-run", type: "checkbox", value: false },
    { key: "historyFails", label: "History unavailable", type: "checkbox", value: false },
  ],
  states(v) {
    const scripts = ["power", "temp_up", "temp_down", "fan_up", "fan_down"].map((a) =>
      entity(`script.stove_${a}`, "off"),
    );
    const list = [
      entity("input_select.stove_status", String(v.status), { options: STOVE_OPTIONS }, Number(v.minutes)),
      entity("sensor.stove_temperature", String(v.temperature), { device_class: "temperature" }),
      entity("sensor.stove_power", String(v.power), { device_class: "power", unit_of_measurement: "W" }),
      ...(Number(v.avgIgnition) > 0 ? [entity("sensor.stove_avg_ignition", String(v.avgIgnition), { unit_of_measurement: "min" })] : []),
      entity("sensor.stove_failed_today", String(v.failures)),
      entity("input_number.stove_heating_rate", String(v.heatRate), { unit_of_measurement: "°C/h" }),
      entity("input_number.stove_cooling_rate", String(v.coolRate), { unit_of_measurement: "°C/h" }),
      ...(Number(v.pellets) >= 0 ? [entity("sensor.stove_refill_in", String(v.pellets), { unit_of_measurement: "h" })] : []),
      ...scripts,
    ];
    return Object.fromEntries(list.map((e) => [e.entity_id, e]));
  },
};

stove.presets = [
  { name: "Off, last run", values: { status: "Uit", minutes: 25, power: 0 } },
  { name: "Igniting", values: { status: "Ontsteken", minutes: 6, power: 310 } },
  { name: "Slow ignition", values: { status: "Brandt", minutes: 38, ignitionMin: 17 } },
  { name: "Cooling down", values: { status: "Uitdoven", minutes: 12, power: 18 } },
  { name: "Failed ignition", values: { status: "Storing", minutes: 4, ignitionMin: 15, power: 0 } },
  { name: "Low pellets", values: { pellets: 3 } },
  { name: "Wrong state", values: { status: "Uit", minutes: 12, power: 410 } },
  { name: "History starts mid-run", values: { noRunHistory: true } },
];

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
  group: "Design",
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


const MINUTE = 60_000;
const DAY_MS = 86_400_000;

// A believable stretch of heating: the pump cycles between 05:30 and 23:00, rooms follow the day.
const midnight = (t: number): number => new Date(t).setHours(0, 0, 0, 0);

interface FakeCase {
  // The target is the frost temperature all the time.
  frost: boolean;
  // One glitchy reading yesterday afternoon.
  spike: boolean;
  // A dip and rebound over four readings within four minutes, yesterday afternoon.
  dip: boolean;
  // The pump only ran on one day (two days ago).
  oneDay: boolean;
  // Days of history that exist; earlier ones return nothing, like a new install.
  dataDays: number;
}

const fakePumpOn = (t: number, c: FakeCase): boolean => {
  const d = new Date(t);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 5.5 || h > 23) return false;
  if (c.oneDay && midnight(t) !== midnight(Date.now() - 2 * DAY_MS)) return false;
  const day = Math.floor(t / DAY_MS);
  const cycle = 70 + (day % 5) * 6;
  return (t / MINUTE) % cycle < 22 + (day % 3) * 5;
};
const fakeSetpoint = (t: number, c: FakeCase): number => {
  if (c.frost) return 5;
  const d = new Date(t);
  const h = d.getHours() + d.getMinutes() / 60;
  return h >= 6.5 && h < 22.5 ? 20.5 : 17;
};
const fakeTemp = (t: number, offset: number, c: FakeCase): number => {
  const base = 18.4 + 1.3 * Math.sin((t / DAY_MS) * 2 * Math.PI - 1.6) + 0.35 * Math.sin(t / (80 * MINUTE)) + offset;
  const spikeAt = midnight(Date.now()) - 10 * 3_600_000;
  return c.spike && Math.abs(t - spikeAt) < 5 * MINUTE ? base + 9 : base;
};
const roomOffset = (id: string): number => ([...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 40) / 10 - 2;

function fakeHistory(
  message: Record<string, unknown>,
  v: Record<string, ControlValue>,
): Record<string, Array<Record<string, unknown>>> {
  const c: FakeCase = { frost: !!v.frost, spike: !!v.spike, dip: !!v.dip, oneDay: !!v.oneDay, dataDays: Number(v.dataDays ?? 60) };
  const end = Date.parse(message.end_time as string);
  const asked = Date.parse(message.start_time as string);
  // Nothing exists before the install, and the first sample is the first real reading.
  const start = Math.max(asked, end - c.dataDays * DAY_MS);
  const withAttributes = message.minimal_response === false;
  const out: Record<string, Array<Record<string, unknown>>> = {};
  for (const id of message.entity_ids as string[]) {
    const items: Array<Record<string, unknown>> = [];
    const push = (t: number, s: string, a?: Record<string, unknown>) => items.push({ lu: t / 1000, s, ...(a ? { a } : {}) });
    if (start >= end) {
      out[id] = items;
      continue;
    }
    if (id === "binary_sensor.heating_pump") {
      let last: boolean | undefined;
      for (let t = start; t <= end; t += MINUTE) {
        const on = fakePumpOn(t, c);
        if (on !== last) push(t, on ? "on" : "off");
        last = on;
      }
    } else if (id === "climate.heating") {
      for (let t = start; t <= end; t += 30 * MINUTE) {
        push(t, "heat", withAttributes ? { temperature: fakeSetpoint(t, c), current_temperature: fakeTemp(t, 0, c) } : undefined);
      }
    } else if (id === "input_select.heating_mode") {
      push(start, "Eco");
      for (let d = midnight(start); d < end; d += DAY_MS) {
        const local = new Date(d);
        local.setHours(6, 30, 0, 0);
        if (local.getTime() > start && local.getTime() < end) push(local.getTime(), "Comfort");
        local.setHours(22, 30, 0, 0);
        if (local.getTime() > start && local.getTime() < end) push(local.getTime(), "Eco");
      }
      const boost = end - 30 * 3_600_000;
      if (boost > start) push(boost, "Boost");
      items.sort((a, b) => Number(a.lu) - Number(b.lu));
    } else if (id.startsWith("binary_sensor.heating_")) {
      push(start, "off");
      const at = end - 3 * DAY_MS;
      if (id.endsWith("battery_low") && at > start) push(at, "on");
    } else {
      const offset = id === "sensor.heating_control_temperature" ? 0 : roomOffset(id);
      for (let t = start; t <= end; t += 10 * MINUTE) push(t, fakeTemp(t, offset, c).toFixed(1));
      const dipAt = midnight(Date.now()) - 9 * 3_600_000;
      if (c.dip && dipAt > start) {
        [6, 9, 8, 5].forEach((drop, m) => push(dipAt + m * MINUTE, (fakeTemp(dipAt + m * MINUTE, offset, c) - drop).toFixed(1)));
        items.sort((a, b) => Number(a.lu) - Number(b.lu));
      }
    }
    out[id] = items;
  }
  return out;
}

const longTermSensors = (v: Record<string, ControlValue>): HassEntity[] => {
  const hours = (id: string, value: number) => entity(id, String(value), { unit_of_measurement: "h", device_class: "duration" });
  const count = (id: string, value: number) => entity(id, String(value), { unit_of_measurement: "times" });
  const out: HassEntity[] = [];
  if (v.longTerm) {
    out.push(
      hours("sensor.heating_pump_runtime_today", 4.4),
      hours("sensor.heating_pump_runtime_yesterday", 6.2),
      hours("sensor.heating_pump_runtime_week", 38.5),
      hours("sensor.heating_pump_runtime_month", 151.2),
      count("sensor.heating_pump_starts_today", 9),
      count("sensor.heating_pump_starts_yesterday", 12),
      count("sensor.heating_pump_starts_week", 71),
      count("sensor.heating_pump_starts_month", 298),
    );
  }
  if (v.season) {
    out.push(hours("sensor.heating_pump_runtime_season", 412.6), count("sensor.heating_pump_starts_season", 1304));
  }
  return out;
};

const heatingStats: Scene = {
  ...heating,
  name: "Heating stats",
  tag: "yvz-heating-stats-card",
  width: 560,
  config: { type: "custom:yvz-heating-stats-card" },
  extra: [{ type: "custom:yvz-heating-stats-card", compact: true }],
  history: fakeHistory,
  controls: [
    ...heating.controls,
    { key: "frost", label: "Frost target (5°)", type: "checkbox", value: false },
    { key: "spike", label: "One glitchy reading yesterday", type: "checkbox", value: false },
    { key: "dip", label: "Dip and rebound within 4 minutes", type: "checkbox", value: false },
    { key: "oneDay", label: "Pump ran on one day only", type: "checkbox", value: false },
    gaugeControl("dataDays", "Days of history", 60, 1, 60),
    { key: "season", label: "Season sensors", type: "checkbox", value: true },
    { key: "longTerm", label: "Long-term sensors (today, week, month)", type: "checkbox", value: false },
  ],
  states(v) {
    const states = heating.states(v);
    for (const e of longTermSensors(v)) states[e.entity_id] = e;
    return states;
  },
};

heatingStats.presets = [
  { name: "Wide panel", width: 1100, height: 780, extra: [] },
  { name: "Frost target and spike", values: { frost: true, spike: true } },
  { name: "Dip and rebound", values: { dip: true } },
  { name: "One active day", values: { oneDay: true } },
  {
    name: "New install",
    values: { dataDays: 2 },
    config: { type: "custom:yvz-heating-stats-card", name: "Heating stats (new install)", period: "month" },
  },
];

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

const gaugeCard: Scene = {
  name: "Gauge card",
  tag: "yvz-gauge-card",
  width: 360,
  config: {
    type: "custom:yvz-gauge-card",
    entity: "sensor.workshop_cpu",
    name: "CPU",
    warn_at: 70,
    error_at: 90,
    trend: true,
  },
  extra: [
    { type: "custom:yvz-gauge-card", entity: "sensor.workshop_battery", name: "Battery", variant: "segments", warn_at: 40, error_at: 15, invert: true },
    { type: "custom:yvz-gauge-card", entity: "sensor.workshop_temp", variant: "stat", icon: "mdi:thermometer", warn_at: 60, error_at: 75, trend: true },
    { type: "custom:yvz-gauge-card", entity: "sensor.workshop_room", name: "Room", min: 10, max: 30, target: "sensor.workshop_target", tap_action: { action: "call-service", perform_action: "script.demo" } },
  ],
  controls: [
    gaugeControl("cpu", "CPU (%)", 42),
    gaugeControl("battery", "Battery (%)", 30),
    gaugeControl("temp", "Temperature (°C)", 48, 20, 100),
    gaugeControl("room", "Room (°C)", 19.4, 10, 30, 0.1),
    gaugeControl("target", "Target (°C)", 21, 10, 30, 0.5),
  ],
  states(v) {
    const n = (k: string) => Number(v[k]);
    const list = [
      sensor("sensor.workshop_cpu", n("cpu"), "%", { friendly_name: "Workshop CPU" }),
      sensor("sensor.workshop_battery", n("battery"), "%", { friendly_name: "Workshop battery" }),
      sensor("sensor.workshop_temp", n("temp"), "°C", { friendly_name: "Workshop temperature" }),
      sensor("sensor.workshop_room", n("room"), "°C", { friendly_name: "Room" }),
      sensor("sensor.workshop_target", n("target"), "°C"),
    ];
    return Object.fromEntries(list.map((e) => [e.entity_id, e]));
  },
};

// A stand-in for the camera: a dark bench with a build plate.
const PRINTER_PICTURE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4048"/><stop offset="1" stop-color="#16181c"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><rect x="170" y="240" width="300" height="14" rx="3" fill="#5b616b"/><path d="M200 240 L240 150 H400 L440 240 Z" fill="#c4543a" opacity=".85"/><rect x="300" y="60" width="40" height="70" rx="4" fill="#8b929c"/><rect x="312" y="130" width="16" height="24" fill="#5b616b"/></svg>',
)}`;

const PRINTER_STATES: Record<string, string> = {
  off: "offline",
  wait: "offline",
  ready: "operational",
  printing: "printing",
  paused: "paused",
  error: "error",
};

const printer: Scene = {
  name: "Printer",
  tag: "yvz-printer-card",
  width: 440,
  config: { type: "custom:yvz-printer-card", name: "Printer" },
  controls: [
    { key: "mode", label: "State", type: "select", value: "printing", options: Object.keys(PRINTER_STATES) },
    gaugeControl("progress", "Progress (%)", 42),
    gaugeControl("minutesLeft", "Minutes left", 78, 0, 600),
    gaugeControl("elapsed", "Minutes since start (-1 = no sensor)", 82, -1, 600),
    gaugeControl("finishedAgo", "Minutes since OctoPrint went ready", 20, 0, 300),
    gaugeControl("hotend", "Hotend (°C)", 208, 0, 300),
    gaugeControl("hotendTarget", "Hotend target (°C)", 210, 0, 300, 5),
    gaugeControl("bed", "Bed (°C)", 59, 0, 120),
    gaugeControl("bedTarget", "Bed target (°C)", 60, 0, 120, 5),
    { key: "camera", label: "Camera picture", type: "checkbox", value: true },
  ],
  states(v) {
    const n = (k: string) => Number(v[k]);
    const mode = String(v.mode);
    const list = [
      entity("switch.grillplats_plug", mode === "off" ? "off" : "on"),
      entity("sensor.octoprint_current_state", PRINTER_STATES[mode], {}, n("finishedAgo")),
      ...(n("elapsed") >= 0
        ? [entity("sensor.octoprint_start_time", new Date(Date.now() - n("elapsed") * 60_000).toISOString(), { device_class: "timestamp" })]
        : []),
      entity("binary_sensor.octoprint_printing", mode === "printing" ? "on" : "off"),
      sensor("sensor.octoprint_job_percentage", n("progress"), "%"),
      entity("sensor.octoprint_estimated_finish_time", new Date(Date.now() + n("minutesLeft") * 60_000).toISOString(), {
        device_class: "timestamp",
      }),
      entity("sensor.octoprint_current_file", "benchy_0.2mm_PLA.gcode"),
      sensor("sensor.octoprint_actual_tool0_temp", n("hotend"), "°C"),
      entity("number.octoprint_extruder_temperature", String(n("hotendTarget")), { unit_of_measurement: "°C" }),
      sensor("sensor.octoprint_actual_bed_temp", n("bed"), "°C"),
      entity("number.octoprint_bed_temperature", String(n("bedTarget")), { unit_of_measurement: "°C" }),
      entity("camera.octoprint_camera", "idle", v.camera ? { entity_picture: PRINTER_PICTURE } : {}),
    ];
    return Object.fromEntries(list.map((e) => [e.entity_id, e]));
  },
  service(domain, service, data, v): Record<string, ControlValue> | void {
    if (domain === "script") {
      if (service === "printer_power_on") return { mode: "ready" };
      if (service === "printer_power_off_safe") return { mode: "off" };
      if (service === "printer_preheat_pla") return { hotendTarget: 200, bedTarget: 60 };
      if (service === "printer_preheat_petg") return { hotendTarget: 240, bedTarget: 80 };
      if (service === "printer_cooldown") return { hotendTarget: 0, bedTarget: 0 };
      if (service === "printer_temp_adjust") {
        const hot = data.entity === "number.octoprint_extruder_temperature";
        const key = hot ? "hotendTarget" : "bedTarget";
        return { [key]: Math.max(0, Number(v[key]) + Number(data.delta)) };
      }
    }
    if (domain === "number" && service === "set_value") {
      const key = data.entity_id === "number.octoprint_extruder_temperature" ? "hotendTarget" : "bedTarget";
      return { [key]: Number(data.value) };
    }
    if (domain === "button") {
      const id = String(data.entity_id);
      if (id.endsWith("pause_job")) return { mode: "paused" };
      if (id.endsWith("resume_job")) return { mode: "printing" };
      if (id.endsWith("stop_job")) return { mode: "ready" };
    }
  },
};

printer.presets = [
  { name: "Off", values: { mode: "off" } },
  { name: "Waiting for OctoPrint", values: { mode: "wait" } },
  { name: "Ready", values: { mode: "ready", hotend: 24, hotendTarget: 0, bed: 22, bedTarget: 0 } },
  { name: "Paused", values: { mode: "paused" } },
  { name: "Error", values: { mode: "error", hotend: 31, hotendTarget: 0, bed: 28, bedTarget: 0 } },
  { name: "No camera picture", values: { camera: false } },
  {
    name: "Finished",
    values: { mode: "ready", progress: 100, hotend: 38, hotendTarget: 0, bed: 52, bedTarget: 0, elapsed: 190, finishedAgo: 20 },
  },
  { name: "Hot bed, nothing printing", values: { mode: "ready", progress: 0, hotend: 24, hotendTarget: 0, bed: 62, bedTarget: 0, elapsed: -1 } },
  {
    name: "Heating up",
    values: { mode: "ready", progress: 0, hotend: 140, hotendTarget: 210, bed: 48, bedTarget: 60, elapsed: -1 },
  },
  {
    name: "Custom presets",
    values: { mode: "ready", progress: 0, hotend: 24, hotendTarget: 0, bed: 22, bedTarget: 0, elapsed: -1 },
    config: {
      type: "custom:yvz-printer-card",
      name: "Printer",
      presets: [
        { name: "PLA", hotend: 205, bed: 60 },
        { name: "ABS", hotend: 250, bed: 100 },
        { name: "TPU", hotend: 225, bed: 50, icon: "mdi:rubber-duck" },
      ],
    },
  },
];

export const scenes: Scene[] = [host, heating, heatingStats, tesla, gaugeCard, stove, printer, gauges];
