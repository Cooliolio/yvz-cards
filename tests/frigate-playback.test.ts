import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/cards/frigate/yvz-frigate-review-card";
import type { YvzFrigateReviewCard } from "../src/cards/frigate/yvz-frigate-review-card";
import type { Review } from "../src/cards/frigate/types";

const now = Date.now() / 1000;
const MB = 1024 * 1024;

const reviews: Review[] = [
  { id: "r1", camera: "oprit", start_time: now - 600, end_time: now - 580, data: { objects: ["person"], detections: ["det-1"] } },
  { id: "r2", camera: "veranda", start_time: now - 1200, end_time: now - 1180, data: { objects: ["car"], detections: ["det-2"] } },
];

const hass = {
  states: {},
  language: "en",
  locale: { language: "en" },
  config: { time_zone: "UTC" },
  callService: async () => undefined,
  callWS: async (message: Record<string, unknown>) =>
    message.type === "frigate/reviews/get" ? reviews : { path: `${String(message.path)}?authSig=test` },
} as never;

type Card = YvzFrigateReviewCard;

// What the card keeps of the player, which is private: the addresses it will try and how it is doing.
interface Internals {
  sources: Array<{ kind: string; url: string }>;
  playback: { status: string; short: boolean; link?: string };
}

const inner = (card: Card): Internals => card as unknown as Internals;

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36";

const userAgent = (ua: string) => vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);

// A response like Frigate's clips: a chunked 200, optionally declaring a length.
function clip(sizes: number[], init: { status?: number; length?: number } = {}) {
  const status = init.status ?? 200;
  const queue = sizes.map((n) => new Uint8Array(n));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(init.length === undefined ? {} : { "content-length": String(init.length) }),
    body: {
      getReader: () => ({
        read: async () => (queue.length ? { done: false, value: queue.shift()! } : { done: true, value: undefined }),
      }),
    },
    blob: async () => new Blob(queue),
  };
}

const fetched: string[] = [];
let urlCount = 0;
let created: Blob[] = [];

function stubFetch(handler: (url: string) => ReturnType<typeof clip> | Promise<ReturnType<typeof clip>>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      fetched.push(url);
      return handler(url);
    }),
  );
}

beforeEach(() => {
  fetched.length = 0;
  urlCount = 0;
  created = [];
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    created.push(blob as Blob);
    return `blob:clip-${++urlCount}`;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function mount(): Promise<Card> {
  const card = document.createElement("yvz-frigate-review-card") as Card;
  card.setConfig({ type: "custom:yvz-frigate-review-card", instance_id: "frigate" });
  card.hass = hass;
  document.body.append(card);
  await vi.waitFor(() => expect(card.shadowRoot?.querySelectorAll(".tile").length).toBe(reviews.length));
  return card;
}

async function openTile(card: Card, id: string): Promise<void> {
  card.shadowRoot!.querySelector<HTMLElement>(`[data-id="${id}"]`)!.click();
}

async function openPlayer(): Promise<Card> {
  const card = await mount();
  await openTile(card, "r1");
  await vi.waitFor(() => expect(inner(card).sources?.length).toBeGreaterThan(0));
  return card;
}

const root = (card: Card) => card.shadowRoot!;
const video = (card: Card) => root(card).querySelector("video")!;
const src = (card: Card) => video(card).getAttribute("src") ?? "";
const diag = (card: Card) => root(card).querySelector(".diag")?.textContent ?? "";
const status = (card: Card) => inner(card).playback.status;

// The browser answers a source with an error and a code, like <video> does.
function failWith(card: Card, code: number): void {
  Object.defineProperty(video(card), "error", { configurable: true, value: { code } });
  video(card).dispatchEvent(new Event("error"));
}

describe("playing straight from the address (Chrome, Android, desktop)", () => {
  it("sets the signed recording as the video address and downloads nothing", async () => {
    userAgent(CHROME);
    stubFetch(() => clip([10]));
    const card = await openPlayer();
    expect(inner(card).sources.map((s) => s.kind)).toEqual(["mp4", "clip"]);
    expect(src(card)).toMatch(/\/api\/frigate\/frigate\/recording\/oprit\/start\/\d+\/end\/\d+\?authSig=test$/);
    expect(fetched).toEqual([]);
  });

  it("falls back to the detection clip when the recording fails, and says why", async () => {
    userAgent(CHROME);
    const card = await openPlayer();
    failWith(card, 4);
    await vi.waitFor(() => expect(src(card)).toBe("/api/frigate/notifications/det-1/oprit/clip.mp4"));
    expect(diag(card)).toBe("mp4 failed: code 4");
    await vi.waitFor(() => expect(root(card).querySelector(".short")).toBeTruthy());
  });

  it("gives up on a source that never starts and says it timed out", async () => {
    userAgent(CHROME);
    const card = await mount();
    // the clock is faked before the player opens, so the card's own timer for the first source is the fake one
    vi.useFakeTimers();
    await openTile(card, "r1");
    await vi.advanceTimersByTimeAsync(100);
    expect(src(card)).toContain("/recording/");
    await vi.advanceTimersByTimeAsync(9000);
    await card.updateComplete;
    expect(diag(card)).toBe("mp4 timed out");
    expect(src(card)).toContain("/clip.mp4");
  });

  it("ends with the message and the link when nothing plays", async () => {
    userAgent(CHROME);
    const card = await openPlayer();
    failWith(card, 4);
    await card.updateComplete;
    failWith(card, 3);
    await vi.waitFor(() => expect(status(card)).toBe("failed"));
    expect(root(card).querySelector(".failed p")?.textContent).toBe("Clip not available for this event");
    expect(root(card).querySelector(".failed a")?.getAttribute("href")).toContain("/recording/oprit/");
    expect(diag(card)).toBe("mp4 failed: code 4 · clip failed: code 3");
  });

  it("keeps the video muted and inline", async () => {
    userAgent(CHROME);
    const card = await openPlayer();
    expect(video(card).hasAttribute("playsinline")).toBe(true);
    expect(video(card).muted).toBe(true);
  });
});

describe("downloading the clip first (iOS, Safari)", () => {
  for (const [name, ua] of [["iPhone", IPHONE], ["Safari", SAFARI]] as const) {
    it(`${name}: fetches the signed recording and plays it from a blob`, async () => {
      userAgent(ua);
      stubFetch(() => clip([2 * MB, MB]));
      const card = await openPlayer();
      await vi.waitFor(() => expect(src(card)).toBe("blob:clip-1"));
      expect(fetched).toHaveLength(1);
      expect(fetched[0]).toMatch(/\/recording\/oprit\/start\/\d+\/end\/\d+\?authSig=test$/);
      expect(created[0].type).toBe("video/mp4");
      expect(created[0].size).toBe(3 * MB);
      expect(video(card).muted).toBe(true);
      expect(video(card).hasAttribute("playsinline")).toBe(true);
    });
  }

  it("does the same on Chrome only where that isn't desktop Chrome", async () => {
    userAgent(CHROME);
    stubFetch(() => clip([10]));
    const card = await openPlayer();
    expect(fetched).toEqual([]);
    expect(src(card)).toContain("/recording/");
  });

  it("shows \"Loading clip…\" while it downloads and not after", async () => {
    userAgent(IPHONE);
    let finish!: () => void;
    stubFetch(() => new Promise((resolve) => (finish = () => resolve(clip([MB])))));
    const card = await openPlayer();
    await vi.waitFor(() => expect(root(card).querySelector(".loading")?.textContent).toBe("Loading clip…"));
    expect(src(card)).toBe("");
    finish();
    await vi.waitFor(() => expect(src(card)).toBe("blob:clip-1"));
    expect(root(card).querySelector(".loading")).toBeNull();
  });

  it("moves on to the detection clip when the fetch is refused, and shows the status", async () => {
    userAgent(IPHONE);
    stubFetch((url) => (url.includes("/recording/") ? clip([], { status: 400 }) : clip([MB])));
    const card = await openPlayer();
    await vi.waitFor(() => expect(src(card)).toBe("blob:clip-1"));
    expect(fetched).toHaveLength(2);
    expect(fetched[1]).toBe("/api/frigate/notifications/det-1/oprit/clip.mp4");
    expect(diag(card)).toBe("mp4 fetch failed: 400");
    expect(root(card).querySelector(".short")).toBeTruthy();
  });

  it("skips a clip that declares more than 80 MB without downloading it", async () => {
    userAgent(IPHONE);
    stubFetch((url) => (url.includes("/recording/") ? clip([], { length: 95 * MB }) : clip([MB])));
    const card = await openPlayer();
    await vi.waitFor(() => expect(src(card)).toBe("blob:clip-1"));
    expect(diag(card)).toBe("mp4 too large (95 MB)");
  });

  it("stops reading a chunked clip that grows past 80 MB", async () => {
    userAgent(IPHONE);
    stubFetch((url) => (url.includes("/recording/") ? clip(Array(9).fill(10 * MB)) : clip([MB])));
    const card = await openPlayer();
    await vi.waitFor(() => expect(src(card)).toBe("blob:clip-1"));
    expect(diag(card)).toMatch(/^mp4 too large \(\d+ MB\)$/);
  });

  it("reports a network failure and an empty answer", async () => {
    userAgent(IPHONE);
    stubFetch((url) => {
      if (url.includes("/recording/")) throw new TypeError("Load failed");
      return clip([], { status: 200 });
    });
    const card = await openPlayer();
    await vi.waitFor(() => expect(status(card)).toBe("failed"));
    expect(diag(card)).toBe("mp4 fetch failed · clip fetch failed: 200");
  });

  it("ends with the message and the link when no clip can be fetched", async () => {
    userAgent(IPHONE);
    stubFetch(() => clip([], { status: 404 }));
    const card = await openPlayer();
    await vi.waitFor(() => expect(status(card)).toBe("failed"));
    expect(root(card).querySelector(".failed p")?.textContent).toBe("Clip not available for this event");
    expect(root(card).querySelector(".failed a")?.getAttribute("href")).toContain("/recording/oprit/");
    expect(diag(card)).toBe("mp4 fetch failed: 404 · clip fetch failed: 404");
  });

  it("falls back when the downloaded clip still won't play, with the video's error code", async () => {
    userAgent(IPHONE);
    stubFetch(() => clip([MB]));
    const card = await openPlayer();
    await vi.waitFor(() => expect(src(card)).toBe("blob:clip-1"));
    failWith(card, 4);
    await vi.waitFor(() => expect(src(card)).toBe("blob:clip-2"));
    expect(diag(card)).toBe("mp4 failed: code 4");
  });

  it("releases the clip's memory when the player switches event or closes", async () => {
    userAgent(IPHONE);
    stubFetch(() => clip([MB]));
    const card = await openPlayer();
    await vi.waitFor(() => expect(src(card)).toBe("blob:clip-1"));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await openTile(card, "r2");
    await vi.waitFor(() => expect(src(card)).toBe("blob:clip-2"));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:clip-1");
    root(card).querySelectorAll<HTMLElement & { shadowRoot: ShadowRoot }>(".bar yvz-icon-button")[2].shadowRoot.querySelector("button")!.click();
    await card.updateComplete;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:clip-2");
  });

  it("drops a download that finishes after another event was opened", async () => {
    userAgent(IPHONE);
    const slow: Array<() => void> = [];
    stubFetch((url) => (url.includes("det-1") || url.includes("/oprit/") ? new Promise((resolve) => slow.push(() => resolve(clip([MB])))) : clip([MB])));
    const card = await openPlayer();
    await vi.waitFor(() => expect(slow).toHaveLength(1));
    await openTile(card, "r2");
    await vi.waitFor(() => expect(src(card)).toBe("blob:clip-1"));
    slow[0]();
    await card.updateComplete;
    await Promise.resolve();
    // the late clip of the first event never replaces the second one
    expect(src(card)).toBe("blob:clip-1");
    expect(inner(card).playback.status).not.toBe("failed");
  });
});
