import type { HistoryItem } from "../design/components/yvz-sparkline";
import type { HomeAssistant } from "./types";

export interface Sample {
  t: number;
  s: string;
  a?: Record<string, unknown>;
}

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
