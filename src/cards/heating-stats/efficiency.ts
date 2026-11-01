import { timeWeightedMean, type Interval, type Point } from "./series";

// Heating degree-days count how far the outdoor day average stays below this.
export const BASE_TEMP = 18;
// Below this there was hardly any heating to do, and pump hours per degree-day would blow up.
export const MIN_DEGREE_DAYS = 0.5;
// A room counts as at target from this far below the setpoint.
export const AT_TARGET_TOLERANCE = 0.3;
// Time at target needs at least this much time with a target, or it says nothing.
export const MIN_ADHERENCE_MS = 30 * 60_000;
// A run shorter than this is a short cycle, and a few of them close together are short-cycling.
export const SHORT_RUN_MS = 5 * 60_000;
export const SHORT_CYCLE_MIN_RUNS = 3;
export const SHORT_CYCLE_GAP_MS = 60 * 60_000;
// Above this relative humidity a room gets a warning colour.
export const HUMIDITY_WARN = 65;
// Outdoor data must cover at least this much of a window before a degree-day figure is shown.
const MIN_COVERAGE = 0.8;

const nextDay = (t: number): number => {
  const d = new Date(t);
  d.setDate(d.getDate() + 1);
  return d.getTime();
};

const startOfDay = (t: number): number => new Date(t).setHours(0, 0, 0, 0);

// One day's degree-days: how far its average stays under the base, in proportion to the part of the day used.
export const degreeDaysOf = (mean: number, fraction = 1, base = BASE_TEMP): number => Math.max(0, base - mean) * fraction;

// Degree-days over [from, to], worked out per calendar day from that day's average outdoor temperature.
// `undefined` when the outdoor data covers too little of the window to mean anything.
export function degreeDays(outdoor: Point[], from: number, to: number, base = BASE_TEMP): number | undefined {
  if (to <= from || !outdoor.length) return undefined;
  let total = 0;
  let covered = 0;
  for (let day = startOfDay(from); day < to; day = nextDay(day)) {
    const end = nextDay(day);
    const a = Math.max(day, from);
    const b = Math.min(end, to);
    const mean = timeWeightedMean(outdoor, a, b);
    if (mean === undefined) continue;
    total += degreeDaysOf(mean, (b - a) / (end - day), base);
    covered += b - a;
  }
  return covered / (to - from) >= MIN_COVERAGE ? total : undefined;
}

// Pump hours per degree-day; nothing when it was too mild for the number to mean anything.
export function hoursPerDegreeDay(pumpMs: number, days: number | undefined): number | undefined {
  if (days === undefined || days < MIN_DEGREE_DAYS) return undefined;
  return pumpMs / 3_600_000 / days;
}

// The average outdoor temperature of each of the given days (up to `now` for the current one).
export function dayMeans(outdoor: Point[], days: number[], now: number): Array<number | undefined> {
  return days.map((start) => timeWeightedMean(outdoor, start, Math.min(nextDay(start), now)));
}

const stepAt = (points: Point[], t: number): number | undefined => {
  let found: number | undefined;
  for (const p of points) {
    if (p.t > t) break;
    found = p.v;
  }
  return found;
};

// Of the time the heating had a target (and wasn't off), the share the room was at or above it.
export function adherence(
  room: Point[],
  setpoint: Point[],
  active: Interval[],
  from: number,
  to: number,
  tolerance = AT_TARGET_TOLERANCE,
): { share: number; ms: number } | undefined {
  const cuts = new Set<number>([from, to]);
  for (const p of [...room, ...setpoint]) if (p.t > from && p.t < to) cuts.add(p.t);
  for (const [a, b] of active) {
    if (a > from && a < to) cuts.add(a);
    if (b > from && b < to) cuts.add(b);
  }
  const times = [...cuts].sort((a, b) => a - b);
  let counted = 0;
  let hit = 0;
  for (let i = 0; i < times.length - 1; i++) {
    const [a, b] = [times[i], times[i + 1]];
    if (!active.some(([x, y]) => a >= x && b <= y)) continue;
    const target = stepAt(setpoint, a);
    const temp = stepAt(room, a);
    if (target === undefined || temp === undefined || !(target > 0)) continue;
    counted += b - a;
    if (temp >= target - tolerance) hit += b - a;
  }
  return counted >= MIN_ADHERENCE_MS ? { share: hit / counted, ms: counted } : undefined;
}

// Stretches of a string-valued state (the mode) that are not "off".
export function activeIntervals(states: Array<{ t: number; s: string }>, from: number, to: number): Interval[] {
  const out: Interval[] = [];
  let since: number | undefined;
  for (const s of states) {
    const on = s.s.toLowerCase() !== "off" && s.s !== "unavailable" && s.s !== "unknown";
    const t = Math.min(Math.max(s.t, from), to);
    if (on && since === undefined) since = t;
    if (!on && since !== undefined) {
      if (t > since) out.push([since, t]);
      since = undefined;
    }
  }
  if (since !== undefined && to > since) out.push([since, to]);
  return out;
}

export interface ShortCycle {
  // When the last of the short runs started.
  t: number;
  runs: number;
}

// Several short runs close together are the pump short-cycling. A run that began before the window did
// is cut short by the window, so it isn't judged.
export function shortCycles(runs: Interval[], from: number): ShortCycle[] {
  const short = runs.filter(([a, b]) => b - a < SHORT_RUN_MS && a > from);
  const clusters: Interval[][] = [];
  for (const run of short) {
    const last = clusters[clusters.length - 1];
    if (last && run[0] - last[last.length - 1][0] <= SHORT_CYCLE_GAP_MS) last.push(run);
    else clusters.push([run]);
  }
  return clusters
    .filter((c) => c.length >= SHORT_CYCLE_MIN_RUNS)
    .map((c) => ({ t: c[c.length - 1][0], runs: c.length }));
}

// The room that led for most of the period, and how many other rooms led at some point.
export function leaderMix(states: Array<{ t: number; s: string }>, from: number, to: number): { main: string; others: number } | undefined {
  const time = new Map<string, number>();
  states.forEach((s, i) => {
    const a = Math.max(s.t, from);
    const b = Math.min(states[i + 1]?.t ?? to, to);
    if (b > a && s.s && s.s !== "unavailable" && s.s !== "unknown") time.set(s.s, (time.get(s.s) ?? 0) + (b - a));
  });
  if (!time.size) return undefined;
  const [main] = [...time.entries()].sort((a, b) => b[1] - a[1])[0];
  return { main, others: time.size - 1 };
}

// "MM-DD" as the most recent such day at or before `now`, at local midnight; anything else means 1 October.
export function seasonStart(spec: string | undefined, now: number): number {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec((spec ?? "").trim());
  let [month, day] = [10, 1];
  if (m) {
    const [mm, dd] = [Number(m[1]), Number(m[2])];
    const valid = new Date(2024, mm - 1, dd);
    if (mm >= 1 && mm <= 12 && valid.getMonth() === mm - 1 && valid.getDate() === dd) [month, day] = [mm, dd];
  }
  const year = new Date(now).getFullYear();
  const thisYear = new Date(year, month - 1, day).getTime();
  return thisYear <= now ? thisYear : new Date(year - 1, month - 1, day).getTime();
}

