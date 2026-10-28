import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/cards/frigate/yvz-frigate-review-card";
import type { YvzFrigateReviewCard } from "../src/cards/frigate/yvz-frigate-review-card";
import type { Review } from "../src/cards/frigate/types";

const now = Date.now() / 1000;

const reviews: Review[] = [
  { id: "live", camera: "oprit", start_time: now - 30, end_time: null, data: { objects: ["person"], detections: ["det-live"] } },
  { id: "done", camera: "veranda", start_time: now - 600, end_time: now - 580, data: { objects: ["car"], detections: ["det-done"] } },
];

const fakeHass = (list: Review[]) =>
  ({
    states: {},
    language: "en",
    locale: { language: "en" },
    config: { time_zone: "UTC" },
    callService: async () => undefined,
    callWS: async (message: Record<string, unknown>) =>
      message.type === "frigate/reviews/get" ? list : { path: `${String(message.path)}?authSig=test` },
  }) as never;

type Mounted = YvzFrigateReviewCard & { preview?: boolean };

async function mount(preview: boolean | undefined, when: "before" | "after"): Promise<Mounted> {
  const card = document.createElement("yvz-frigate-review-card") as Mounted;
  // Home Assistant sets `preview` on every card it creates, to say whether it is in the card picker.
  if (when === "before" && preview !== undefined) card.preview = preview;
  card.setConfig({ type: "custom:yvz-frigate-review-card", title: "Camera" });
  card.hass = fakeHass(reviews);
  document.body.append(card);
  await vi.waitFor(() => expect(card.shadowRoot?.querySelectorAll(".tile").length).toBe(reviews.length));
  if (when === "after" && preview !== undefined) {
    card.preview = preview;
    card.requestUpdate();
    await card.updateComplete;
  }
  return card;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("yvz-frigate-review-card tiles", () => {
  for (const preview of [false, true, undefined]) {
    for (const when of ["before", "after"] as const) {
      it(`renders a tile per review with preview ${String(preview)} set ${when} the first render`, async () => {
        const card = await mount(preview, when);
        const tiles = [...card.shadowRoot!.querySelectorAll<HTMLElement>(".tile")];
        expect(tiles.map((t) => t.dataset.id)).toEqual(["live", "done"]);
        const sources = tiles.map((t) => t.querySelector("img")?.dataset.src ?? "");
        // an ended review shows its animated preview, one still going on a thumbnail of its first detection
        expect(sources[0]).toContain("/api/frigate/notifications/det-live/thumbnail.jpg");
        expect(sources[1]).toContain("/api/frigate/notifications/done/review_preview.gif");
      });
    }
  }
});
