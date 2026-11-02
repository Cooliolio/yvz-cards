// Which key figures the strip above the charts draws, and how they are laid out.
export type TileKey = "runtime" | "starts" | "longest" | "avg" | "degree_days" | "per_degree_day" | "at_target" | "rate";

// The tiles that carry the subtle accent outline: the ones that come from outside data or the thermostat.
export const ACCENT_TILES: TileKey[] = ["degree_days", "per_degree_day", "at_target", "rate"];

export interface TileData {
  // The outdoor sensor is configured.
  outdoor: boolean;
  degreeDays?: number;
  atTarget?: number;
  heatingRate?: number;
}

// A tile whose data is missing is left out rather than drawn empty.
export function tilesFor(d: TileData): TileKey[] {
  const tiles: TileKey[] = ["runtime", "starts", "longest", "avg"];
  if (d.outdoor && d.degreeDays !== undefined) tiles.push("degree_days", "per_degree_day");
  if (d.atTarget !== undefined) tiles.push("at_target");
  if (d.heatingRate !== undefined) tiles.push("rate");
  return tiles;
}

export const TILE_MIN_PX = 158;
export const TILE_GAP_PX = 12;

// Columns that fill the rows evenly: 8 tiles become 4 + 4 and 5 become 3 + 2, never a lone tile on a row.
export function tileColumns(count: number, widthPx: number, min = TILE_MIN_PX, gap = TILE_GAP_PX): number {
  if (count <= 0) return 1;
  const fit = Math.max(1, Math.floor((widthPx + gap) / (min + gap)));
  const rows = Math.ceil(count / fit);
  return Math.max(1, Math.min(count, Math.ceil(count / rows)));
}
