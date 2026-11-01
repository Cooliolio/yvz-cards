import { fetchSamples } from "../../shared/history";
import type { HomeAssistant } from "../../shared/types";
import { BASE_TEMP, degreeDays, degreeDaysOf } from "./efficiency";
import { cleanPoints, runsOf } from "./history";
import { DAY, HOUR, numeric } from "./series";

export interface Season {
  // Where the figures begin: the season start, or the first day the recorder has pump data for.
  from: number;
  pumpMs: number;
  starts: number;
  degreeDays: number;
}

interface StatRow {
  start: number | string;
  mean?: number | null;
}

const midnight = (t: number): number => new Date(t).setHours(0, 0, 0, 0);

// The daily outdoor means of finished days from long-term statistics, which outlive the recorder's history.
async function dailyMeans(hass: HomeAssistant, outdoor: string, from: number, to: number): Promise<Map<number, number>> {
  const means = new Map<number, number>();
  try {
    const result = await hass.callWS<Record<string, StatRow[]>>({
      type: "recorder/statistics_during_period",
      start_time: new Date(from).toISOString(),
      end_time: new Date(to).toISOString(),
      statistic_ids: [outdoor],
      period: "day",
      types: ["mean"],
    });
    for (const row of result?.[outdoor] ?? []) {
      // Newer versions answer in epoch milliseconds, older ones with an ISO string.
      const start = typeof row.start === "number" ? row.start : Date.parse(row.start);
      if (Number.isFinite(start) && typeof row.mean === "number") means.set(midnight(start), row.mean);
    }
  } catch {
    // No statistics for it; the history is tried instead.
  }
  return means;
}

// Pump hours and degree-days since the start of the season, for pump hours per degree-day.
export async function loadSeason(
  hass: HomeAssistant,
  pump: string,
  outdoor: string,
  start: number,
  now: number,
): Promise<Season | undefined> {
  const samples = (await fetchSamples(hass, [pump], start, now))[pump] ?? [];
  if (!samples.length) return undefined;
  // The recorder may not reach back to the start; both figures then begin on the first day it has.
  const from = samples[0].t > start + HOUR ? midnight(samples[0].t + DAY) : start;
  const today = midnight(now);
  if (from >= now) return undefined;
  const runs = runsOf(samples, from, now);

  const days = Math.max(0, Math.round((today - from) / DAY));
  const means = days > 0 ? await dailyMeans(hass, outdoor, from, today) : new Map<number, number>();
  let finished = 0;
  let dd = 0;
  for (const [day, mean] of means) {
    if (day >= from && day < today) {
      dd += degreeDaysOf(mean);
      finished++;
    }
  }
  const todayPoints = cleanPoints(numeric((await fetchSamples(hass, [outdoor], Math.max(today, from), now))[outdoor] ?? []));
  const sofar = degreeDays(todayPoints, Math.max(today, from), now, BASE_TEMP);

  if (finished < days * 0.8) {
    // Statistics are missing or patchy: the whole season from the history, if that reaches back far enough.
    const whole = cleanPoints(numeric((await fetchSamples(hass, [outdoor], from, now))[outdoor] ?? []));
    const all = degreeDays(whole, from, now, BASE_TEMP);
    return all === undefined ? undefined : { from, pumpMs: sumOf(runs.intervals), starts: runs.starts, degreeDays: all };
  }
  return { from, pumpMs: sumOf(runs.intervals), starts: runs.starts, degreeDays: dd + (sofar ?? 0) };
}

const sumOf = (intervals: Array<[number, number]>): number => intervals.reduce((n, [a, b]) => n + (b - a), 0);
