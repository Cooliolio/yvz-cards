import type { Sample } from "../../shared/history";
import type { HassEntity, HomeAssistant } from "../../shared/types";

// Two timestamps this close are the same change: history and logbook both read it from the same state.
const MATCH_MS = 2000;
// Presses by the same hand on the same helper this close together are one adjustment.
export const MERGE_MS = 2 * 60_000;

export interface LogbookEntry {
  t: number;
  entity: string;
  state?: string;
  userId?: string;
  // The automation or script that made the change, when there is one and no user. Empty text when unnamed.
  auto?: string;
}

// What the matching and merging need to know about an event; the card's own events carry more.
export interface Changed {
  t: number;
  kind: string;
  key: string;
  entity?: string;
  state?: string;
  value?: number;
  userId?: string;
  auto?: string;
  // How many presses were merged into this one.
  count?: number;
}

const text = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

// `when` is epoch seconds in the websocket answer; an ISO string is accepted too.
function whenOf(v: unknown): number | undefined {
  const n = typeof v === "number" ? v * 1000 : typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

// An automation or script is the cause when the context says so. No context at all (a restore after a restart,
// an integration) is not worth a label.
function autoOf(raw: Record<string, unknown>): string | undefined {
  const type = text(raw.context_event_type);
  const domain = text(raw.context_domain);
  const entity = text(raw.context_entity_id);
  const by = type === "automation_triggered" || type === "script_started" || domain === "automation" || domain === "script";
  const named = !!entity && /^(automation|script)\./.test(entity);
  if (!by && !named) return undefined;
  return text(raw.context_entity_id_name) ?? text(raw.context_name) ?? "";
}

export function parseLogbook(raw: unknown): LogbookEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LogbookEntry[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    const t = whenOf(item?.when);
    const entity = text(item?.entity_id);
    if (t === undefined || !entity) continue;
    const userId = text(item.context_user_id);
    out.push({ t, entity, state: text(item.state), userId, auto: userId ? undefined : autoOf(item) });
  }
  return out.sort((a, b) => a.t - b.t);
}

// One call for every helper the events come from; a logbook that fails or is switched off just means no names.
export async function fetchLogbook(hass: HomeAssistant, ids: string[], start: number, end: number): Promise<LogbookEntry[]> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return [];
  try {
    const raw = await hass.callWS<unknown>({
      type: "logbook/get_events",
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
      entity_ids: wanted,
    });
    return parseLogbook(raw);
  } catch {
    return [];
  }
}

// user id -> name, from the person entities. Anyone can read these; the user list needs an admin.
export function personNames(states: Record<string, HassEntity> | undefined): Map<string, string> {
  const names = new Map<string, string>();
  for (const [id, st] of Object.entries(states ?? {})) {
    if (!id.startsWith("person.")) continue;
    const userId = st.attributes?.user_id;
    if (typeof userId !== "string" || !userId) continue;
    const name = st.attributes.friendly_name;
    names.set(userId, typeof name === "string" && name.trim() ? name.trim() : id.slice("person.".length));
  }
  return names;
}

const same = (a: string | undefined, b: string | undefined): boolean => {
  if (a === undefined || b === undefined) return true;
  const x = parseFloat(a);
  const y = parseFloat(b);
  return !Number.isNaN(x) && !Number.isNaN(y) ? x === y : a === b;
};

// Gives each event the user or automation behind it. Every logbook entry explains at most one event, and the
// closest pairs are settled first, so two changes seconds apart each get their own entry.
export function attachOrigin<T extends Changed>(events: T[], entries: LogbookEntry[]): T[] {
  const pairs: Array<{ event: number; entry: number; gap: number }> = [];
  events.forEach((event, i) => {
    if (!event.entity) return;
    entries.forEach((entry, j) => {
      const gap = Math.abs(entry.t - event.t);
      if (entry.entity === event.entity && gap <= MATCH_MS && same(entry.state, event.state)) pairs.push({ event: i, entry: j, gap });
    });
  });
  pairs.sort((a, b) => a.gap - b.gap);
  const out = [...events];
  const taken = new Set<number>();
  for (const { event, entry } of pairs) {
    if (out[event] !== events[event] || taken.has(entry)) continue;
    taken.add(entry);
    out[event] = { ...events[event], userId: entries[entry].userId, auto: entries[entry].auto };
  }
  return out;
}

const originOf = (e: Changed): string => e.userId ?? (e.auto !== undefined ? `auto:${e.auto}` : "");

// A slider dragged in steps leaves a trail of changes; the trail becomes one event with the last value and time.
export function mergePresses<T extends Changed>(events: T[], gapMs = MERGE_MS): T[] {
  const byTime = [...events].sort((a, b) => a.t - b.t);
  const out: T[] = [];
  const open = new Map<string, T>();
  for (const event of byTime) {
    if (event.kind !== "target") {
      out.push(event);
      continue;
    }
    const key = `${event.entity}|${originOf(event)}`;
    const last = open.get(key);
    if (last && event.t - last.t <= gapMs) {
      const merged = { ...event, count: (last.count ?? 1) + 1 };
      out[out.indexOf(last)] = merged;
      open.set(key, merged);
    } else {
      open.set(key, event);
      out.push(event);
    }
  }
  return out;
}

// The samples where the state really changed. The first one is the state the period began in, and a
// sample that only changed an attribute carries the same state again.
export function changesOf(samples: Sample[]): Array<{ t: number; s: string; from: string }> {
  const out: Array<{ t: number; s: string; from: string }> = [];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].s !== samples[i - 1].s) out.push({ t: samples[i].t, s: samples[i].s, from: samples[i - 1].s });
  }
  return out;
}
