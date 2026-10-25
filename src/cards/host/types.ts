import type { LovelaceCardConfig } from "../../shared/types";

export interface HostSensor {
  entity?: string;
  name?: string;
  warn_at?: number;
  error_at?: number;
  icon?: string;
}

export const GUEST_KINDS = ["vm", "container"] as const;
export type GuestKind = (typeof GUEST_KINDS)[number];

export interface HostGuest {
  name?: string;
  kind?: GuestKind;
  icon?: string;
  prefix?: string;
  status?: string;
  cpu?: string;
  memory?: string;
  disk?: string;
  uptime?: string;
}

export interface HostCardConfig extends LovelaceCardConfig {
  name?: string;
  status?: string;
  uptime?: string;
  temperature?: string;
  cpu?: string;
  memory?: string;
  temperatures?: HostSensor[];
  disks?: HostSensor[];
  network?: { down?: string; up?: string };
  disk_io?: { read?: string; write?: string };
  guests?: HostGuest[];
  stats?: HostSensor[];
  trend?: boolean;
  trend_hours?: number;
  columns?: number;
  compact?: boolean;
}
