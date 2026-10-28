import type { LovelaceCardConfig } from "../../shared/types";

export type FrigateLayout = "strip" | "grid";
export type FrigateSeverity = "alert" | "detection" | "all";

// Same keys and defaults as the earlier local frigate-review-card, plus `layout`.
export interface FrigateReviewConfig extends LovelaceCardConfig {
  title?: string;
  // `strip` swipes sideways, `grid` is the earlier layout. Default: strip.
  layout?: FrigateLayout;
  // How many reviews to show. Default 30 for the strip, 4 for the grid; at most 30.
  count?: number;
  // Grid columns, 1 to 6.
  columns?: number;
  severity?: FrigateSeverity;
  // Frigate camera names; empty means all.
  cameras?: string[];
  // Only reviews containing one of these objects.
  labels?: string[];
  instance_id?: string;
  // Seconds of video before a review starts and after it ends.
  pre_padding?: number;
  post_padding?: number;
  // Seconds between refreshes.
  refresh?: number;
}

export interface Review {
  id: string;
  camera: string;
  start_time: number;
  // Missing while the event is still going on.
  end_time?: number | null;
  severity?: string;
  data?: { objects?: string[]; detections?: string[] };
}

export const MAX_COUNT = 30;
export const DEFAULT_GRID_COUNT = 4;
export const DEFAULT_COLUMNS = 2;
export const DEFAULT_REFRESH = 20;
export const MIN_REFRESH = 5;
export const MAX_FETCH = 100;

export const KNOWN_OBJECTS = [
  "person",
  "car",
  "dog",
  "cat",
  "bicycle",
  "motorcycle",
  "bird",
  "package",
  "face",
  "license_plate",
] as const;
