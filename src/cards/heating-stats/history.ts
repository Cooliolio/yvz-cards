import type { HomeAssistant } from "../../shared/types";
import { bucket, type HistoryItem } from "../../design/components/yvz-sparkline";
import type { Period } from "./types";

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
const MAX_LINE_POINTS = 240;
// A heating run shorter than this isn't a real warm-up.
const MIN_WARMUP_MS = 5 * 60_000;

export interface Sample {
  t: number;
  s: string;
  a?: Record<string, unknown>;
}

export interface Point {
  t: number;
  v: number;
}

export type Interval = [number, number];

interface RawItem extends HistoryItem {
  a?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
}

export function parse(items: RawItem[] | undefined): Sample[] {
  return (items ?? [])
    .map((i) => ({
      t: i.lu != null ? i.lu * 1000 : Date.parse(i.last_updated ?? ""),
      s: String(i.s ?? i.state ?? ""),
      a: i.a ?? i.attributes,
    }))
    .filter((s) => !Number.isNaN(s.t))
    .sort((a, b) => a.t - b.t);
}

// One history call; entities that fail or have no history come back as an empty list.
export async function fetchSamples(
  hass: HomeAssistant,
  ids: string[],
  start: number,
  end: number,
  attributes = false,
): Promise<Record<string, Sample[]>> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return {};
  try {
    const result = await hass.callWS<Record<string, RawItem[]>>({
      type: "history/history_during_period",
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
      entity_ids: wanted,
      minimal_response: !attributes,
      no_attributes: !attributes,
      significant_changes_only: false,
    });
    return Object.fromEntries(wanted.map((id) => [id, parse(result[id])]));
  } catch {
    return {};
  }
}

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
  prevTo: number;
}

// "Today" is compared with yesterday up to the same time of day, so the comparison is fair.
export function windowOf(period: Period, now: number): Window {
  if (period === "today") {
    const from = dayStarts(1, now)[0];
    return { from, to: now, prevFrom: from - DAY, prevTo: from - DAY + (now - from) };
  }
  const length = (period === "week" ? 7 : 30) * DAY;
  return { from: now - length, to: now, prevFrom: now - 2 * length, prevTo: now - length };
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
  kind: "mode" | "warning";
  key: string;
}

export interface StatsData {
  period: Period;
  window: Window;
  intervals: Interval[];
  runtime: number;
  starts: number;
  longest: number;
  prev: { runtime: number; starts: number; longest: number; avgTemp?: number };
  avgTemp?: number;
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
    fetchSamples(hass, [ids.trend, ...roomEntities], window.from, now),
    fetchSamples(hass, [ids.mode, ...warningIds], window.from, now),
  ]);

  const pump = pumpMap[ids.pump] ?? [];
  const all = runsOf(pump, pumpFrom, now);
  const current = runsOf(pump, window.from, now);
  const previous = runsOf(pump, window.prevFrom, window.prevTo);

  const control = numeric(controlMap[ids.control] ?? []);
  const setpoint = (climateMap[ids.climate] ?? [])
    .map((s) => ({ t: s.t, v: Number(s.a?.temperature) }))
    .filter((p) => Number.isFinite(p.v));

  const rooms: RoomStats[] = Object.entries(roomMap).map(([name, entity]) => {
    const samples = roomMapSamples[entity] ?? [];
    const pts = numeric(samples).filter((p) => p.t >= window.from);
    const values = pts.map((p) => p.v);
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

  // Average rate: the trend sensor while the pump was running, ignoring cooling.
  const trendPts = numeric(roomMapSamples[ids.trend] ?? []);
  const rates = trendPts.filter((p) => p.v > 0 && current.intervals.some(([a, b]) => p.t >= a && p.t <= b)).map((p) => p.v);

  const lastRun = [...current.intervals].reverse().find(([a, b]) => b - a >= MIN_WARMUP_MS);
  const lastWarmUp: WarmUp | undefined = lastRun
    ? {
        from: valueAt(control, lastRun[0]),
        to: valueAt(control, lastRun[1]),
        minutes: Math.round((lastRun[1] - lastRun[0]) / 60_000),
      }
    : undefined;

  const events: StatsEvent[] = [];
  (eventMap[ids.mode] ?? []).slice(1).forEach((s) => events.push({ t: s.t, kind: "mode", key: s.s }));
  for (const [key, id] of Object.entries(ids.warnings)) {
    const samples = eventMap[id] ?? [];
    samples.forEach((s, i) => {
      if (i > 0 && s.s === "on" && samples[i - 1].s !== "on") events.push({ t: s.t, kind: "warning", key });
    });
  }
  events.sort((a, b) => b.t - a.t);

  return {
    period,
    window,
    intervals: current.intervals,
    runtime: sumOf(current.intervals),
    starts: current.starts,
    longest: longestOf(current.intervals),
    prev: {
      runtime: sumOf(previous.intervals),
      starts: previous.starts,
      longest: longestOf(previous.intervals),
      avgTemp: timeWeightedMean(control, window.prevFrom, window.prevTo),
    },
    avgTemp: timeWeightedMean(control, window.from, now),
    days: days.map((start) => ({ start, runtime: overlap(all.intervals, start, start + DAY) })),
    setpoint: thin(setpoint.filter((p) => p.t >= window.from)),
    temperature: thin(control.filter((p) => p.t >= window.from)),
    rooms,
    heatingRate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : undefined,
    lastWarmUp,
    events: events.slice(0, 5),
    empty: !pump.length && !control.length,
    fetchedAt: Date.now(),
    pumpChanged: hass.states[ids.pump]?.last_changed ?? "",
  };
}
