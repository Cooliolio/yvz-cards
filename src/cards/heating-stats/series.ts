import type { Sample } from "../../shared/history";

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export interface Point {
  t: number;
  v: number;
}

export type Interval = [number, number];

export function numeric(samples: Sample[]): Point[] {
  return samples.map((s) => ({ t: s.t, v: parseFloat(s.s) })).filter((p) => !Number.isNaN(p.v));
}

export function valueAt(points: Point[], t: number): number | undefined {
  let found: number | undefined;
  for (const p of points) {
    if (p.t > t) break;
    found = p.v;
  }
  return found ?? points[0]?.v;
}

// Mean of a stepped series over [from, to], weighting each value by how long it held.
export function timeWeightedMean(points: Point[], from: number, to: number): number | undefined {
  if (!points.length || to <= from) return undefined;
  let sum = 0;
  let covered = 0;
  points.forEach((p, i) => {
    const a = Math.max(p.t, from);
    const b = Math.min(points[i + 1]?.t ?? to, to);
    if (b > a) {
      sum += p.v * (b - a);
      covered += b - a;
    }
  });
  return covered ? sum / covered : undefined;
}

// Local midnights, oldest first, ending with today's.
export function dayStarts(count: number, now: number): number[] {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(d);
    day.setDate(day.getDate() - (count - 1 - i));
    return day.getTime();
  });
}

