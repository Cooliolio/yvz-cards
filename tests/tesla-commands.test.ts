import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandTracker, DONE_MS, errorReason, FAILED_MS, SLOW_MS } from "../src/cards/tesla/commands";
import { AFTER_ANSWER_MS, RefreshSchedule, REFRESH_OFFSETS, WAKE_OFFSETS } from "../src/cards/tesla/refresh";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const deferred = () => {
  let resolve!: (v?: unknown) => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

describe("errorReason", () => {
  it("reads the object Home Assistant rejects with, not just Errors", () => {
    expect(errorReason({ code: "home_assistant_error", message: "Vehicle unavailable" })).toBe("Vehicle unavailable");
    expect(errorReason(new Error("boom"))).toBe("boom");
    expect(errorReason("plain")).toBe("plain");
    expect(errorReason(undefined)).toBe("");
    expect(errorReason({})).toBe("");
  });
});

describe("CommandTracker", () => {
  it("goes sending, done, then clears", async () => {
    const onChange = vi.fn();
    const tracker = new CommandTracker(onChange);
    const call = deferred();
    const run = tracker.run("trunk", () => call.promise);
    expect(tracker.get("trunk")?.phase).toBe("sending");
    expect(tracker.isBusy("trunk")).toBe(true);
    call.resolve();
    expect(await run).toBe(true);
    expect(tracker.get("trunk")?.phase).toBe("done");
    expect(tracker.isBusy("trunk")).toBe(false);
    vi.advanceTimersByTime(DONE_MS);
    expect(tracker.get("trunk")).toBeUndefined();
    expect(onChange).toHaveBeenCalled();
  });

  it("says waking when the car was asleep", () => {
    const tracker = new CommandTracker(() => {});
    void tracker.run("lock", () => new Promise(() => {}), true);
    expect(tracker.get("lock")?.phase).toBe("waking");
  });

  it("keeps the reason when it fails, until it times out", async () => {
    const tracker = new CommandTracker(() => {});
    const ok = await tracker.run("flash", () => Promise.reject({ code: "x", message: "Rate limited" }));
    expect(ok).toBe(false);
    expect(tracker.get("flash")).toEqual({ phase: "failed", reason: "Rate limited" });
    expect(tracker.isBusy("flash")).toBe(false);
    vi.advanceTimersByTime(FAILED_MS);
    expect(tracker.get("flash")).toBeUndefined();
  });

  it("is not failed after a minute of silence, only 'slow', and still blocks a second press", async () => {
    const tracker = new CommandTracker(() => {});
    const call = deferred();
    const run = tracker.run("trunk", () => call.promise, true);
    vi.advanceTimersByTime(SLOW_MS);
    expect(tracker.get("trunk")?.phase).toBe("slow");
    expect(tracker.isBusy("trunk")).toBe(true);
    call.resolve();
    await run;
    expect(tracker.get("trunk")?.phase).toBe("done");
  });

  it("ignores the late answer of an older press", async () => {
    const tracker = new CommandTracker(() => {});
    const first = deferred();
    const second = deferred();
    const a = tracker.run("trunk", () => first.promise);
    const b = tracker.run("trunk", () => second.promise);
    first.reject({ message: "old" });
    await a;
    expect(tracker.get("trunk")?.phase).toBe("sending");
    second.resolve();
    await b;
    expect(tracker.get("trunk")?.phase).toBe("done");
  });

  it("clears every timer on dispose", async () => {
    const tracker = new CommandTracker(() => {});
    void tracker.run("a", () => new Promise(() => {}));
    await tracker.run("b", () => Promise.resolve());
    tracker.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(tracker.latest).toBeUndefined();
  });
});

describe("RefreshSchedule", () => {
  const make = (settled: (since: number) => boolean = () => false) => {
    const poll = vi.fn();
    const schedule = new RefreshSchedule({ poll, settled, now: () => Date.now() });
    return { poll, schedule };
  };

  it("asks at 5, 15, 30 and 60 s and then stops", () => {
    const { poll, schedule } = make();
    schedule.start(REFRESH_OFFSETS);
    for (const [i, s] of REFRESH_OFFSETS.entries()) {
      vi.advanceTimersByTime(s * 1000 - (i ? REFRESH_OFFSETS[i - 1] * 1000 : 0));
      expect(poll).toHaveBeenCalledTimes(i + 1);
    }
    expect(schedule.active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the wake timing of 20 and 60 s", () => {
    const { poll, schedule } = make();
    schedule.start(WAKE_OFFSETS);
    vi.advanceTimersByTime(19_999);
    expect(poll).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(poll).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(40_000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it("stops early once the car is online and has reported", () => {
    let news = false;
    const { poll, schedule } = make(() => news);
    schedule.start(REFRESH_OFFSETS);
    vi.advanceTimersByTime(5000);
    expect(poll).toHaveBeenCalledTimes(1);
    news = true;
    vi.advanceTimersByTime(10_000);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(schedule.active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hands the press time to the check", () => {
    const settled = vi.fn(() => false);
    const { schedule } = make(settled);
    vi.setSystemTime(1_000_000);
    schedule.start([5]);
    vi.advanceTimersByTime(5000);
    expect(settled).toHaveBeenCalledWith(1_000_000);
  });

  it("starts over from a new press", () => {
    const { poll, schedule } = make();
    schedule.start(REFRESH_OFFSETS);
    vi.advanceTimersByTime(4000);
    schedule.start(REFRESH_OFFSETS);
    vi.advanceTimersByTime(4000);
    expect(poll).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it("looks once more after the command was accepted, then stops", () => {
    const { poll, schedule } = make();
    schedule.afterAnswer();
    vi.advanceTimersByTime(AFTER_ANSWER_MS);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(schedule.active).toBe(false);
  });

  it("skips the look after the answer when a scheduled poll is about to run", () => {
    const { poll, schedule } = make();
    schedule.start(REFRESH_OFFSETS);
    vi.advanceTimersByTime(1000);
    schedule.afterAnswer(); // the 5 s poll is 4 s away
    vi.advanceTimersByTime(4000);
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it("clears its timers on cancel", () => {
    const { poll, schedule } = make();
    schedule.start(REFRESH_OFFSETS);
    schedule.cancel();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(120_000);
    expect(poll).not.toHaveBeenCalled();
  });
});
