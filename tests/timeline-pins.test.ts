import { afterEach, describe, expect, it } from "vitest";
import "../src/design/components/yvz-timeline";
import type { Pin } from "../src/design/pins";

const FROM = 1_000_000_000;
const TO = FROM + 7 * 86_400_000;
const pin = (frac: number, who: string, color: number, text = "Target 17.5°"): Pin => ({
  id: `${frac}-${who}`,
  t: FROM + frac * (TO - FROM),
  text,
  who,
  when: "Yesterday 11:10 PM",
  initial: who[0].toUpperCase(),
  color,
});

async function mount(pins: Pin[], width = 700) {
  const el = document.createElement("yvz-timeline") as unknown as HTMLElement & Record<string, unknown> & { updateComplete: Promise<boolean> };
  el.from = FROM;
  el.to = TO;
  el.height = 240;
  el.pins = pins;
  el.pinsLabel = "who changed it";
  el.clusterText = (count: number, until: number) => `${count} changes until ${until}`;
  document.body.append(el);
  // happy-dom has no layout, so the measured width is set the way the observer would.
  el.width = width;
  await el.updateComplete;
  return el;
}

const buttons = (el: HTMLElement) => [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.pin")];
const popover = (el: HTMLElement) => el.shadowRoot!.querySelector<HTMLElement>("#pop");

afterEach(() => document.body.replaceChildren());

describe("timeline pins", () => {
  it("draws no lane without pins", async () => {
    const el = await mount([]);
    expect(el.shadowRoot!.querySelector(".lane")).toBeNull();
  });

  it("draws one real button per pin, named by what, who and when", async () => {
    const el = await mount([pin(0.2, "Yasin", 1), pin(0.6, "Muzaffer", 0)]);
    const b = buttons(el);
    expect(b).toHaveLength(2);
    expect(b[0].getAttribute("aria-label")).toBe("Target 17.5°, Yasin, Yesterday 11:10 PM");
    expect(b[0].getAttribute("aria-haspopup")).toBe("dialog");
    expect(b[0].getAttribute("aria-expanded")).toBe("false");
    expect(b[0].textContent).toContain("Y");
  });

  it("merges close pins into one with a count, named by the cluster text", async () => {
    const el = await mount([pin(0.5, "Yasin", 1), pin(0.505, "Yasin", 1), pin(0.51, "Yasin", 1)]);
    const b = buttons(el);
    expect(b).toHaveLength(1);
    expect(b[0].getAttribute("aria-label")).toMatch(/^3 changes until/);
    expect(el.shadowRoot!.querySelector(".badge")?.textContent).toBe("3");
  });

  it("opens a popover on click and closes it on a second click", async () => {
    const el = await mount([pin(0.2, "Yasin", 1)]);
    buttons(el)[0].click();
    await el.updateComplete;
    expect(popover(el)?.getAttribute("role")).toBe("dialog");
    expect(popover(el)?.textContent).toContain("Target 17.5° · Yasin");
    expect(buttons(el)[0].getAttribute("aria-expanded")).toBe("true");
    expect(buttons(el)[0].getAttribute("aria-controls")).toBe("pop");
    buttons(el)[0].click();
    await el.updateComplete;
    expect(popover(el)).toBeNull();
  });

  it("lists the changes of a cluster in its popover", async () => {
    const el = await mount([pin(0.5, "Yasin", 1, "Target 17.0°"), pin(0.505, "Yasin", 1, "Target 17.5°")]);
    buttons(el)[0].click();
    await el.updateComplete;
    const text = popover(el)!.textContent!;
    expect(text).toContain("2 changes until");
    expect(text).toContain("Target 17.0°");
    expect(text).toContain("Target 17.5°");
  });

  it("closes on Escape and gives focus back to the pin", async () => {
    const el = await mount([pin(0.2, "Yasin", 1)]);
    const b = buttons(el)[0];
    b.click();
    await el.updateComplete;
    b.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
    await el.updateComplete;
    await el.updateComplete;
    expect(popover(el)).toBeNull();
    expect(el.shadowRoot!.activeElement).toBe(buttons(el)[0]);
  });

  it("closes on a press elsewhere, but not on a press inside", async () => {
    const el = await mount([pin(0.2, "Yasin", 1)]);
    buttons(el)[0].click();
    await el.updateComplete;
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(popover(el)).not.toBeNull();
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(popover(el)).toBeNull();
  });

  it("gives each user's pin its colour and an automation the neutral one", async () => {
    const el = await mount([pin(0.2, "Yasin", 1), pin(0.4, "Auto", -1)]);
    const [a, b] = buttons(el);
    expect(a.dataset.c).toBe("1");
    expect(b.dataset.c).toBe("n");
  });
});
