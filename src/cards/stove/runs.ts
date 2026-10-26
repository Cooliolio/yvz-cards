import type { YvzState } from "../../design";
import type { Sample } from "../../shared/history";

const MINUTE = 60_000;

export interface Segment {
  state: string;
  role: YvzState;
  from: number;
  to: number;
  // The history starts inside this segment, so when it really began is unknown.
  truncated: boolean;
}

export interface RunInfo {
  // How long the last ignition took (start of Ontsteken to start of Brandt), when known.
  ignitionMs?: number;
  // The last time the stove was on: from the start of its ignition (or burn) to when it went out.
  lastOn?: { from: number; to: number };
  // The current Storing came right after an ignition, which then never lit.
  failedIgnition?: { ms: number };
}

// Turns status samples into stretches of one state each, with the role the user gave every state.
export function segmentsOf(samples: Sample[], roleOf: (state: string) => YvzState, now: number): Segment[] {
  const out: Segment[] = [];
  samples.forEach((sample, i) => {
    const last = out[out.length - 1];
    if (last && last.state === sample.s) return;
    if (last) last.to = sample.t;
    out.push({ state: sample.s, role: roleOf(sample.s), from: sample.t, to: now, truncated: i === 0 });
  });
  return out;
}

// What the status history says about ignition and the last run. Anything that can't be told for sure,
// like a run that began before the history does, is left out so the card can hide the line.
export function analyse(segments: Segment[]): RunInfo {
  const info: RunInfo = {};
  const burn = [...segments.keys()].reverse().find((i) => segments[i].role === "on");
  if (burn !== undefined) {
    const before = segments[burn - 1];
    const ignited = before?.role === "pending" && !before.truncated;
    if (ignited) info.ignitionMs = segments[burn].from - before.from;
    const start = ignited ? before.from : segments[burn].truncated ? undefined : segments[burn].from;
    const out = segments.slice(burn + 1).find((s) => s.role === "off");
    if (start !== undefined && out) info.lastOn = { from: start, to: out.from };
  }
  const current = segments[segments.length - 1];
  const previous = segments[segments.length - 2];
  if (current?.role === "error" && previous?.role === "pending" && !previous.truncated) {
    info.failedIgnition = { ms: current.from - previous.from };
  }
  return info;
}

export const minutes = (ms: number): number => Math.max(1, Math.round(ms / MINUTE));
