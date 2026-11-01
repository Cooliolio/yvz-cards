import type { YvzState } from "../../design";

// After a power command the button stays locked this long. The command is a blind IR toggle, so a second one
// sent before the stove has answered would undo the first.
export const POWER_LOCK_MS = 30_000;
// Turning on is answered by the igniter: the draw jumps by far more than the swings of a running stove.
export const ON_RISE_WATTS = 100;
// How long "no reaction" is worth showing after a turn-on that was never answered.
export const UNANSWERED_MS = 3 * 60_000;

// How far the server's clock may run ahead of the browser's before its timestamps are ignored.
const CLOCK_SKEW_MS = 5000;

// What a power press should do, as far as the card can tell from the status it sees.
export type PowerDirection = "on" | "off" | "unknown";

export interface PowerSent {
  direction: PowerDirection;
  // The draw when the command went out; the baseline for a rise.
  watts: number | undefined;
  at: number;
}

export type PowerPhase = "idle" | "waiting" | "unanswered";

export function directionOf(role: YvzState): PowerDirection {
  if (role === "off") return "on";
  if (role === "on" || role === "pending") return "off";
  return "unknown";
}

// `lastTriggered` is when the power script last ran, from any place (this card, another dashboard, an automation).
export function powerPhase(
  sent: PowerSent | undefined,
  lastTriggered: number | undefined,
  watts: number | undefined,
  now: number,
): { phase: PowerPhase; reacted: boolean } {
  // Only a turn-on can be seen to work. Turning off starts a cooling fan, so the draw says nothing, and the
  // status may be flipped by the automation that runs the script; both get the full lock.
  const reacted =
    sent?.direction === "on" && watts !== undefined && sent.watts !== undefined && watts - sent.watts >= ON_RISE_WATTS;
  if (reacted) return { phase: "idle", reacted: true };

  // A run that lies far in the future means the clocks disagree; trusting it would stretch the lock.
  const triggered = lastTriggered !== undefined && lastTriggered <= now + CLOCK_SKEW_MS ? lastTriggered : undefined;
  const until = Math.max(sent ? sent.at : 0, triggered ?? 0) + POWER_LOCK_MS;
  if ((sent || triggered !== undefined) && now < until) return { phase: "waiting", reacted: false };
  if (sent?.direction === "on" && now < sent.at + UNANSWERED_MS) return { phase: "unanswered", reacted: false };
  return { phase: "idle", reacted: false };
}
