import { bucket } from "../../design/components/yvz-sparkline";
import { fetchSamples, type Sample } from "../../shared/history";
import type { HomeAssistant } from "../../shared/types";
import type { Period } from "./types";

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
const MAX_LINE_POINTS = 240;
// A heating run shorter than this isn't a real warm-up.
const MIN_WARMUP_MS = 10 * 60_000;
// A run this long is worth listing as an event.
const LONG_RUN_MS = 30 * 60_000;
// A reading this far from both neighbours, within minutes, is a glitch rather than weather.
const SPIKE_STEP = 3;
const SPIKE_WINDOW_MS = 15 * 60_000;
// A short excursion (a dip and rebound) lasts at most this long, and ends back near where it started.
const EXCURSION_MS = 5 * 60_000;
const EXCURSION_RETURN = SPIKE_STEP / 2;

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

export function thin(points: Point[], max = MAX_LINE_POINTS): Point[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out = Array.from({ length: max }, (_, i) => points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

// Drops glitches so they can't stretch a chart or skew a mean: a single reading that jumps away from both
// neighbours, and a short run of readings (up to 5 minutes) that strays more than 3° from the level before
// and after it while those two are close to each other.
export function despike<T extends { t: number }>(items: T[], value: (item: T) => number): T[] {
  const drop = new Set<number>();
  const near = (a: T, b: T) => b.t - a.t <= SPIKE_WINDOW_MS;

  items.forEach((item, i) => {
    const prev = items[i - 1];
    const next = items[i + 1];
    if (!prev || !next || !near(prev, item) || !near(item, next)) return;
    const v = value(item);
    if (Math.abs(v - value(prev)) > SPIKE_STEP && Math.abs(v - value(next)) > SPIKE_STEP) drop.add(i);
  });

  for (let i = 1; i < items.length - 1; i++) {
    let found = -1;
    for (let j = i; j < items.length - 1 && items[j].t - items[i].t <= EXCURSION_MS; j++) {
      const before = items[i - 1];
      const after = items[j + 1];
      if (!near(before, items[i]) || !near(items[j], after)) continue;
      const vb = value(before);
      const va = value(after);
      if (Math.abs(va - vb) > EXCURSION_RETURN) continue;
      const base = (vb + va) / 2;
      const run = items.slice(i, j + 1).map((x) => Math.abs(value(x) - base));
      if (run.every((d) => d > EXCURSION_RETURN) && run.some((d) => d > SPIKE_STEP)) found = j;
    }
    if (found >= 0) {
      for (let k = i; k <= found; k++) drop.add(k);
      i = found;
    }
  }
  return items.filter((_, i) => !drop.has(i));
}

export const cleanPoints = (points: Point[]): Point[] => despike(points, (p) => p.v);

export function cleanSamples(samples: Sample[]): Sample[] {
  const numbers = samples.filter((s) => !Number.isNaN(parseFloat(s.s)));
  return despike(numbers, (s) => parseFloat(s.s));
}

export interface Runs {
  intervals: Interval[];
  starts: number;
}

// Turns on/off samples into the stretches the pump ran inside [start, end].
export function runsOf(samples: Sample[], start: number, end: number): Runs {
  const intervals: Interval[] = [];
  let since: number | undefined;
  let starts = 0;
  let prev: string | undefined;
  for (const sample of samples) {
    if (sample.t > end) break;
    const t = Math.max(sample.t, start);
    if (sample.s === "on") {
      if (since === undefined) {
        since = t;
        // The first sample is only the state the period began in, so it isn't a start.
        if (prev !== undefined && sample.t >= start) starts++;
      }
    } else if (since !== undefined) {
      if (t > since) intervals.push([since, t]);
      since = undefined;
    }
    prev = sample.s;
  }
  if (since !== undefined && end > since) intervals.push([since, end]);
  return { intervals, starts };
}

const sumOf = (intervals: Interval[]): number => intervals.reduce((n, [a, b]) => n + (b - a), 0);
const longestOf = (intervals: Interval[]): number => intervals.reduce((n, [a, b]) => Math.max(n, b - a), 0);

export function overlap(intervals: Interval[], from: number, to: number): number {
  return intervals.reduce((n, [a, b]) => n + Math.max(0, Math.min(b, to) - Math.max(a, from)), 0);
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

export interface Window {
  from: number;
  to: number;
  prevFrom: number;
  // Up to the same time of day (today) or the end of the previous period.
  prevTo: number;
  // The whole previous period; only differs from prevTo for today.
  prevFullTo: number;
}

// "Today" is compared with yesterday up to the same time of day, so the comparison is fair.
export function windowOf(period: Period, now: number): Window {
  if (period === "today") {
    const from = dayStarts(1, now)[0];
    return { from, to: now, prevFrom: from - DAY, prevTo: from - DAY + (now - from), prevFullTo: from };
  }
  const length = (period === "week" ? 7 : 30) * DAY;
  return { from: now - length, to: now, prevFrom: now - 2 * length, prevTo: now - length, prevFullTo: now - length };
}

export interface RoomStats {
  name: string;
  entity: string;
  current?: number;
  min?: number;
  max?: number;
  values: number[];
}

export interface WarmUp {
  from?: number;
  to?: number;
  minutes: number;
}

export interface StatsEvent {
  t: number;
  kind: "mode" | "warning" | "run";
  key: string;
  // How long a run lasted.
  ms?: number;
}

export interface Totals {
  runtime: number;
  starts: number;
  longest: number;
  avgTemp?: number;
}

export interface StatsData {
  period: Period;
  window: Window;
  intervals: Interval[];
  runtime: number;
  starts: number;
  longest: number;
  // The previous period: up to the same time of day, and (for today) the whole of yesterday.
  prev: Totals;
  prevFull: Totals;
  avgTemp?: number;
  // Elapsed time of the period, for the duty cycle.
  elapsed: number;
  // Days the pump history covers, out of periodDays (0 for today).
  dataDays: number;
  periodDays: number;
  // Finished days that have data, for the daily average.
  finishedWithData: number;
  days: { start: number; runtime: number }[];
  setpoint: Point[];
  temperature: Point[];
  rooms: RoomStats[];
  heatingRate?: number;
  lastWarmUp?: WarmUp;
  events: StatsEvent[];
  // No history at all, e.g. the recorder is off or the entities are missing.
  empty: boolean;
  fetchedAt: number;
  pumpChanged: string;
}

export interface StatsEntities {
  pump: string;
  control: string;
  climate: string;
  trend: string;
  mode: string;
  sensors: string;
  warnings: Record<string, string>;
}

export async function loadStats(
  hass: HomeAssistant,
  ids: StatsEntities,
  roomMap: Record<string, string>,
  period: Period,
  now: number,
): Promise<StatsData> {
  const window = windowOf(period, now);
  const barCount = period === "month" ? 30 : 7;
  const days = dayStarts(barCount, now);
  const pumpFrom = Math.min(window.prevFrom, days[0]);
  const roomEntities = Object.values(roomMap);
  const warningIds = Object.values(ids.warnings);

  const [pumpMap, controlMap, climateMap, roomMapSamples, eventMap] = await Promise.all([
    fetchSamples(hass, [ids.pump], pumpFrom, now),
    fetchSamples(hass, [ids.control], window.prevFrom, now),
    period === "month" ? Promise.resolve<Record<string, Sample[]>>({}) : fetchSamples(hass, [ids.climate], window.from, now, true),
    fetchSamples(hass, roomEntities, window.from, now),
    fetchSamples(hass, [ids.mode, ...warningIds], window.from, now),
  ]);

  const pump = pumpMap[ids.pump] ?? [];
  const all = runsOf(pump, pumpFrom, now);
  const current = runsOf(pump, window.from, now);
  const previous = runsOf(pump, window.prevFrom, window.prevTo);
  const previousFull = runsOf(pump, window.prevFrom, window.prevFullTo);

  // Glitches in the room sensors would stretch the chart and skew the averages, so they go first.
  const control = cleanPoints(numeric(controlMap[ids.control] ?? []));
  const setpoint = (climateMap[ids.climate] ?? [])
    .map((s) => ({ t: s.t, v: Number(s.a?.temperature) }))
    .filter((p) => Number.isFinite(p.v));

  const rooms: RoomStats[] = Object.entries(roomMap).map(([name, entity]) => {
    const samples = cleanSamples(roomMapSamples[entity] ?? []);
    const values = numeric(samples)
      .filter((p) => p.t >= window.from)
      .map((p) => p.v);
    return {
      name,
      entity,
      current: parseFloat(hass.states[entity]?.state ?? ""),
      min: values.length ? Math.min(...values) : undefined,
      max: values.length ? Math.max(...values) : undefined,
      values: bucket(
        samples.map((x) => ({ s: x.s, lu: x.t / 1000 })),
        window.from,
        now,
      ),
    };
  });
  rooms.forEach((r) => {
    if (Number.isNaN(r.current)) r.current = undefined;
  });

  // Real warm-ups only: runs of at least 10 minutes where the room actually got warmer.
  const warmUps = current.intervals
    .filter(([a, b]) => b - a >= MIN_WARMUP_MS)
    .map(([a, b]) => ({ a, b, from: valueAt(control, a), to: valueAt(control, b) }))
    .filter((r): r is { a: number; b: number; from: number; to: number } => r.from != null && r.to != null && r.to > r.from);
  const rise = warmUps.reduce((n, r) => n + (r.to - r.from), 0);
  const hours = warmUps.reduce((n, r) => n + (r.b - r.a) / HOUR, 0);
  const lastRun = warmUps[warmUps.length - 1];
  const lastWarmUp: WarmUp | undefined = lastRun
    ? { from: lastRun.from, to: lastRun.to, minutes: Math.round((lastRun.b - lastRun.a) / 60_000) }
    : undefined;

  const events: StatsEvent[] = [];
  (eventMap[ids.mode] ?? []).slice(1).forEach((s) => events.push({ t: s.t, kind: "mode", key: s.s }));
  for (const [key, id] of Object.entries(ids.warnings)) {
    const samples = eventMap[id] ?? [];
    samples.forEach((s, i) => {
      if (i > 0 && s.s === "on" && samples[i - 1].s !== "on") events.push({ t: s.t, kind: "warning", key });
    });
  }
  current.intervals.forEach(([a, b]) => {
    if (b - a >= LONG_RUN_MS) events.push({ t: a, kind: "run", key: "run", ms: b - a });
  });
  events.sort((a, b) => b.t - a.t);

  const totals = (runs: Runs, from: number, to: number): Totals => ({
    runtime: sumOf(runs.intervals),
    starts: runs.starts,
    longest: longestOf(runs.intervals),
    avgTemp: timeWeightedMean(control, from, to),
  });
  // Days the recorder covers: a new install has a short history and the longer periods can't be trusted yet.
  const periodDays = period === "today" ? 0 : period === "week" ? 7 : 30;
  const firstSample = pump[0]?.t;
  const dataDays = firstSample == null ? 0 : Math.min(periodDays, Math.max(1, Math.ceil((now - firstSample) / DAY)));
  const finishedWithData = days.slice(0, -1).filter((d) => firstSample != null && firstSample <= d + HOUR).length;

  return {
    period,
    window,
    intervals: current.intervals,
    runtime: sumOf(current.intervals),
    starts: current.starts,
    longest: longestOf(current.intervals),
    prev: totals(previous, window.prevFrom, window.prevTo),
    prevFull: totals(previousFull, window.prevFrom, window.prevFullTo),
    avgTemp: timeWeightedMean(control, window.from, now),
    elapsed: now - window.from,
    dataDays,
    periodDays,
    finishedWithData,
    days: days.map((start) => ({ start, runtime: overlap(all.intervals, start, start + DAY) })),
    setpoint: thin(setpoint.filter((p) => p.t >= window.from)),
    temperature: thin(control.filter((p) => p.t >= window.from)),
    rooms,
    heatingRate: hours > 0 ? rise / hours : undefined,
    lastWarmUp,
    events: events.slice(0, 20),
    empty: !pump.length && !control.length,
    fetchedAt: Date.now(),
    pumpChanged: hass.states[ids.pump]?.last_changed ?? "",
  };
}
