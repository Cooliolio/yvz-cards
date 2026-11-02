// Pins on the run timeline: one per change a person or an automation made.

// Pins closer together than this (in px) share one pin with a count.
export const PIN_MERGE_PX = 18;

// The design tokens a user can get, in order. Auto and unknown users are neutral and use none.
export const PIN_PALETTE = ["on", "standby", "pending", "heat"] as const;
export const NEUTRAL = -1;

export interface Pin {
  id: string;
  t: number;
  // What happened, who did it and when, already worded for the viewer: "Target 17.5°", "Muzaffer", "Yesterday 11:10 PM".
  text: string;
  who: string;
  when: string;
  // One letter, or "A" for an automation and "?" for someone unknown.
  initial: string;
  // Index into PIN_PALETTE, or NEUTRAL.
  color: number;
}

export interface PinCluster {
  // 0 to 1 along the window.
  at: number;
  pins: Pin[];
  // The pin's own letter and colour when the whole cluster is one hand; otherwise neutral and no letter.
  initial: string;
  color: number;
  // The latest change in it.
  until: number;
}

// Where in the window a moment falls, 0 to 1; outside it sticks to the edge.
export function pinFraction(t: number, from: number, to: number): number {
  if (to <= from) return 0;
  return Math.min(1, Math.max(0, (t - from) / (to - from)));
}

// Walks the pins in time order and merges those within `gapPx` of the first pin of the cluster being built.
export function clusterPins(pins: Pin[], from: number, to: number, widthPx: number, gapPx = PIN_MERGE_PX): PinCluster[] {
  const sorted = [...pins].sort((a, b) => a.t - b.t);
  const groups: Pin[][] = [];
  for (const pin of sorted) {
    const group = groups[groups.length - 1];
    const anchor = group?.[0];
    if (group && anchor && (pinFraction(pin.t, from, to) - pinFraction(anchor.t, from, to)) * widthPx <= gapPx) group.push(pin);
    else groups.push([pin]);
  }
  return groups.map((group) => {
    const at = group.reduce((n, p) => n + pinFraction(p.t, from, to), 0) / group.length;
    const sameHand = group.every((p) => p.who === group[0].who && p.color === group[0].color);
    return {
      at,
      pins: group,
      initial: sameHand ? group[0].initial : "",
      color: sameHand ? group[0].color : NEUTRAL,
      until: group[group.length - 1].t,
    };
  });
}

// A stable colour per person: their rank among all known user ids, so two people never share one
// (until there are more people than colours).
export function userColors(userIds: Iterable<string>): Map<string, number> {
  const ranked = [...new Set(userIds)].sort();
  return new Map(ranked.map((id, i) => [id, i % PIN_PALETTE.length]));
}

export function initialOf(name: string): string {
  const letter = [...name.trim()][0];
  return letter ? letter.toLocaleUpperCase() : "?";
}
