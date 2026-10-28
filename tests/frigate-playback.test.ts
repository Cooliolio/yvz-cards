import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/cards/frigate/yvz-frigate-review-card";
import type { YvzFrigateReviewCard } from "../src/cards/frigate/yvz-frigate-review-card";
import type { Review } from "../src/cards/frigate/types";

const now = Date.now() / 1000;
const review: Review = {
  id: "r1",
  camera: "oprit",
  start_time: now - 600,
  end_time: now - 580,
  data: { objects: ["person"], detections: ["det-1"] },
};

const signed: string[] = [];

const hass = {
  states: {},
  language: "en",
  locale: { language: "en" },
  config: { time_zone: "UTC" },
  callService: async () => undefined,
  callWS: async (message: Record<string, unknown>) => {
    if (message.type === "frigate/reviews/get") return [review];
    signed.push(String(message.path));
    return { path: `${String(message.path)}?authSig=test` };
  },
} as never;

// What the card sees of the player: which address it set, and how that went.
type Card = YvzFrigateReviewCard & {
  sources: Array<{ kind: string; url: string }>;
  playback: { status: string; short: boolean; link?: string };
  video?: HTMLVideoElement;
};

function canPlay(hls: boolean): void {
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockImplementation((type: string) => (hls && /mpegurl/i.test(type) ? "maybe" : ""));
}

async function openPlayer(): Promise<Card> {
  const card = document.createElement("yvz-frigate-review-card") as Card;
  card.setConfig({ type: "custom:yvz-frigate-review-card", instance_id: "frigate" });
  card.hass = hass;
  document.body.append(card);
  await vi.waitFor(() => expect(card.shadowRoot?.querySelector(".tile")).toBeTruthy());
  card.shadowRoot!.querySelector<HTMLElement>(".tile")!.click();
  await vi.waitFor(() => expect(card.sources?.length).toBeGreaterThan(0));
  return card;
}

// The browser answers a source with an error and a code, like <video> does.
function failWith(card: Card, code: number): void {
  const video = card.shadowRoot!.querySelector("video")!;
  Object.defineProperty(video, "error", { configurable: true, value: { code } });
  video.dispatchEvent(new Event("error"));
}

const kinds = (card: Card) => card.sources.map((s) => s.kind);
const attribute = (card: Card) => card.shadowRoot!.querySelector("video")!.getAttribute("src") ?? "";
const diag = (card: Card) => card.shadowRoot!.querySelector(".diag")?.textContent ?? "";

beforeEach(() => {
  signed.length = 0;
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("clip playback order", () => {
  it("starts with HLS where the browser can play it (iOS, Safari), then the recording, then the detection clip", async () => {
    canPlay(true);
    const card = await openPlayer();
    expect(kinds(card)).toEqual(["hls", "mp4", "clip"]);
    expect(attribute(card)).toMatch(/\/api\/frigate\/frigate\/vod\/oprit\/start\/\d+\/end\/\d+\/index\.m3u8\?authSig=test$/);
  });

  it("starts with the recording elsewhere (Chrome, Android, desktop), then HLS, then the detection clip", async () => {
    canPlay(false);
    const card = await openPlayer();
    expect(kinds(card)).toEqual(["mp4", "hls", "clip"]);
    expect(attribute(card)).toMatch(/\/api\/frigate\/frigate\/recording\/oprit\/start\/\d+\/end\/\d+\?authSig=test$/);
  });

  it("signs the playlist and the recording like the other paths", async () => {
    canPlay(true);
    await openPlayer();
    expect(signed.some((p) => /\/vod\/oprit\/start\/\d+\/end\/\d+\/index\.m3u8$/.test(p))).toBe(true);
    expect(signed.some((p) => /\/recording\/oprit\/start\/\d+\/end\/\d+$/.test(p))).toBe(true);
  });

  it("uses the detection clip's address last", async () => {
    canPlay(true);
    const card = await openPlayer();
    expect(card.sources.at(-1)?.url).toBe("/api/frigate/notifications/det-1/oprit/clip.mp4");
  });

  it("keeps the video muted and inline", async () => {
    canPlay(true);
    const card = await openPlayer();
    const video = card.shadowRoot!.querySelector("video")!;
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.muted).toBe(true);
  });
});

describe("when a source fails", () => {
  it("moves on and says which step failed and how", async () => {
    canPlay(true);
    const card = await openPlayer();
    failWith(card, 4);
    await vi.waitFor(() => expect(attribute(card)).toContain("/recording/"));
    expect(diag(card)).toBe("hls failed: code 4");
    failWith(card, 2);
    await vi.waitFor(() => expect(attribute(card)).toContain("/clip.mp4"));
    expect(diag(card)).toBe("hls failed: code 4 · mp4 failed: code 2");
    // the last step is the short detection clip, and it is labelled as such
    await vi.waitFor(() => expect(card.shadowRoot!.querySelector(".short")).toBeTruthy());
  });

  it("ends with the message and the link when nothing plays, and keeps the reasons visible", async () => {
    canPlay(false);
    const card = await openPlayer();
    for (const code of [4, 4, 3]) {
      failWith(card, code);
      await card.updateComplete;
    }
    await vi.waitFor(() => expect(card.playback.status).toBe("failed"));
    const root = card.shadowRoot!;
    expect(root.querySelector(".failed p")?.textContent).toBe("Clip not available for this event");
    expect(root.querySelector(".failed a")?.getAttribute("href")).toContain("/recording/oprit/");
    expect(diag(card)).toBe("mp4 failed: code 4 · hls failed: code 4 · clip failed: code 3");
  });

  it("gives up on a source that never starts and says it timed out", async () => {
    canPlay(false);
    const card = await openPlayer();
    vi.useFakeTimers();
    // the timer for the first source was set with real timers, so start the next step from here
    failWith(card, 4);
    await card.updateComplete;
    await vi.advanceTimersByTimeAsync(9000);
    await card.updateComplete;
    expect(diag(card)).toBe("mp4 failed: code 4 · hls timed out");
    expect(attribute(card)).toContain("/clip.mp4");
  });
});
