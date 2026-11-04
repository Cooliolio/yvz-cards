// After a command the car needs a moment before Home Assistant knows its new state, and Home Assistant only
// asks a sleeping car for a cheap status every 10 minutes. So the card asks again, a few times, and stops as
// soon as there is news.
//
// `homeassistant.update_entity` does start a fetch: on 4 Nov the card's wake went out at 12:30:17 UTC and the
// status flipped to "on" at 12:30:37, which is the poll 20 s later. (The miss on 2 Nov was most likely a press
// from somewhere other than the card.) Home Assistant debounces coordinator refreshes (10 s cooldown), so polls
// closer together than that may be merged into one.

// Seconds after a press.
export const REFRESH_OFFSETS = [5, 15, 30, 60];
// Waking takes about 20 s, so asking earlier is wasted.
export const WAKE_OFFSETS = [20, 60];
// One more look this long after the command was accepted.
export const AFTER_ANSWER_MS = 3000;
// ...unless a scheduled poll is due within this: HA merges fetches closer together than its 10 s cooldown.
const NEAR_MS = 8000;

export interface RefreshDeps {
  // Asks Home Assistant to fetch again.
  poll(): void;
  // True when the car is online and something changed since `since` (ms), so there is no need to ask again.
  settled(since: number): boolean;
  now(): number;
}

export class RefreshSchedule {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private due: number[] = [];
  private since = 0;
  private running = false;

  constructor(private readonly deps: RefreshDeps) {}

  get active(): boolean {
    return this.running;
  }

  // A new press starts over from that press.
  start(offsets: readonly number[]): void {
    this.cancel();
    this.since = this.deps.now();
    this.running = true;
    for (const seconds of offsets) this.later(seconds * 1000);
  }

  // The command was accepted: look once more shortly after, unless there is news already.
  afterAnswer(): void {
    const now = this.deps.now();
    // A poll about to run covers it.
    if (this.running && this.due.some((at) => at > now && at - now <= NEAR_MS)) return;
    this.running = true;
    this.later(AFTER_ANSWER_MS);
  }

  cancel(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.due = [];
    this.running = false;
  }

  private later(ms: number): void {
    const at = this.deps.now() + ms;
    this.due.push(at);
    this.timers.push(
      setTimeout(() => {
        this.due.splice(this.due.indexOf(at), 1);
        this.fire();
      }, ms),
    );
  }

  private fire(): void {
    if (!this.running) return;
    if (this.deps.settled(this.since)) {
      this.cancel();
      return;
    }
    this.deps.poll();
    // The last look that was planned has run: nothing more to wait for.
    if (!this.due.length) this.cancel();
  }
}
