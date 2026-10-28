import type { LovelaceCardConfig } from "../../shared/types";

interface Temperature {
  actual: string;
  target: string;
}

// Every entity has a default for the OctoPrint setup, so `type` alone is enough.
export const PRINTER_DEFAULTS = {
  camera: "camera.octoprint_camera",
  power: "switch.grillplats_plug",
  printing: "binary_sensor.octoprint_printing",
  state: "sensor.octoprint_current_state",
  progress: "sensor.octoprint_job_percentage",
  finish: "sensor.octoprint_estimated_finish_time",
  file: "sensor.octoprint_current_file",
  start: "sensor.octoprint_start_time",
  hotend: { actual: "sensor.octoprint_actual_tool0_temp", target: "number.octoprint_extruder_temperature" } as Temperature,
  bed: { actual: "sensor.octoprint_actual_bed_temp", target: "number.octoprint_bed_temperature" } as Temperature,
  buttons: {
    pause: "button.octoprint_pause_job",
    resume: "button.octoprint_resume_job",
    stop: "button.octoprint_stop_job",
  },
  scripts: {
    power_on: "script.printer_power_on",
    preheat_pla: "script.printer_preheat_pla",
    preheat_petg: "script.printer_preheat_petg",
    cooldown: "script.printer_cooldown",
    temp_adjust: "script.printer_temp_adjust",
    power_off: "script.printer_power_off_safe",
  },
  step: 5,
  bed_safe: 45,
};

export type PrinterButtons = typeof PRINTER_DEFAULTS.buttons;
export type PrinterScripts = typeof PRINTER_DEFAULTS.scripts;

// A button that preheats: it sets the temperatures, or runs a script of your own instead.
export interface PrinterPreset {
  name: string;
  hotend?: number;
  bed?: number;
  icon?: string;
  script?: string;
}

export interface PrinterCardConfig extends LovelaceCardConfig {
  name?: string;
  camera?: string;
  // The printer counts as off when this isn't "on".
  power?: string;
  printing?: string;
  state?: string;
  progress?: string;
  // A timestamp.
  finish?: string;
  file?: string;
  // A timestamp: when the print started.
  start?: string;
  hotend?: Partial<Temperature>;
  bed?: Partial<Temperature>;
  buttons?: Partial<PrinterButtons>;
  scripts?: Partial<PrinterScripts>;
  // °C per tap on − and +.
  step?: number;
  // Preheat buttons. Without any the card shows PLA and PETG, which run the preheat scripts.
  presets?: PrinterPreset[];
  // The bed counts as still hot above this temperature (°C) when nothing is printing.
  bed_safe?: number;
}

export type PrinterMode = "off" | "wait" | "ready" | "print" | "pause" | "error";

// OctoPrint's states, grouped by what the card does with them.
export const PRINTING_STATES = [
  "printing",
  "printing_sd",
  "printing_streaming",
  "resuming",
  "cancelling",
  "starting",
  "starting_sd",
  "starting_streaming",
  "finishing",
  "transferring_file",
];
export const PAUSED_STATES = ["paused", "pausing"];
export const ERROR_STATES = ["error", "offline_after_error"];
export const READY_STATES = ["operational"];
