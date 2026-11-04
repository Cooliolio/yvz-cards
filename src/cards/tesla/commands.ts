// Keeps track of the commands the card has sent: waiting, done, failed. Pure logic, no DOM, so it can be tested.

export type CommandPhase = "sending" | "waking" | "slow" | "done" | "failed";

export interface CommandState {
  phase: CommandPhase;
  // Why it failed, as Home Assistant told us.
  reason?: string;
}

// "Done" stays this long before the tile shows the car's real state again.
export const DONE_MS = 1500;
// A failure stays until the next press, but not forever on a wall tablet.
export const FAILED_MS = 30_000;
// A sleeping car is woken first, so a command can take this long and still go through.
export const SLOW_MS = 60_000;
// Last resort: a call that never settles stops blocking the control after this.
export const GIVE_UP_MS = 180_000;

// callService rejects with `{ code, message }` from the websocket, not with an Error.
export function errorReason(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const { message, error: nested } = error as { message?: unknown; error?: unknown };
    if (typeof message === "string" && message) return message;
    if (typeof nested === "string" && nested) return nested;
  }
  return "";
}

export class CommandTracker {
  private states = new Map<string, CommandState>();
  private timers = new Map<string, ReturnType<typeof setTimeout>[]>();
  // Bumped per id on every run, so a late answer to an old press can't overwrite a newer one.
  private runs = new Map<string, number>();
  private last?: string;

  constructor(private readonly onChange: () => void) {}

  get(id: string): CommandState | undefined {
    return this.states.get(id);
  }

  // The most recently started command that still has something to show.
  get latest(): { id: string; state: CommandState } | undefined {
    const state = this.last ? this.states.get(this.last) : undefined;
    return this.last && state ? { id: this.last, state } : undefined;
  }

  // Waiting for the car; a second press would send the command twice.
  isBusy(id: string): boolean {
    const phase = this.states.get(id)?.phase;
    return phase === "sending" || phase === "waking" || phase === "slow";
  }

  get anyBusy(): boolean {
    return [...this.states.keys()].some((id) => this.isBusy(id));
  }

  // Runs the call and follows it. Resolves true when it went through.
  async run(id: string, action: () => Promise<unknown>, waking = false): Promise<boolean> {
    const run = (this.runs.get(id) ?? 0) + 1;
    this.runs.set(id, run);
    this.clearTimers(id);
    this.last = id;
    this.set(id, { phase: waking ? "waking" : "sending" });
    const current = () => this.runs.get(id) === run;
    this.after(id, SLOW_MS, () => {
      if (current() && this.isBusy(id)) this.set(id, { phase: "slow" });
    });
    this.after(id, GIVE_UP_MS, () => {
      if (current() && this.isBusy(id)) this.drop(id);
    });
    try {
      await action();
    } catch (error) {
      if (!current()) return false;
      this.clearTimers(id);
      this.set(id, { phase: "failed", reason: errorReason(error) });
      this.after(id, FAILED_MS, () => this.drop(id));
      return false;
    }
    if (!current()) return true;
    this.clearTimers(id);
    this.set(id, { phase: "done" });
    this.after(id, DONE_MS, () => this.drop(id));
    return true;
  }

  dispose(): void {
    for (const id of [...this.timers.keys()]) this.clearTimers(id);
    // Late answers after this are ignored.
    this.runs.clear();
    this.states.clear();
    this.last = undefined;
  }

  private set(id: string, state: CommandState): void {
    this.states.set(id, state);
    this.onChange();
  }

  private drop(id: string): void {
    this.states.delete(id);
    this.clearTimers(id);
    this.onChange();
  }

  private after(id: string, ms: number, fn: () => void): void {
    const timer = setTimeout(fn, ms);
    this.timers.set(id, [...(this.timers.get(id) ?? []), timer]);
  }

  private clearTimers(id: string): void {
    this.timers.get(id)?.forEach(clearTimeout);
    this.timers.delete(id);
  }
}
