import type { ReactiveController, ReactiveControllerHost } from "lit";

const FIRST_MS = 400;
const NEXT_MS = 120;

// While a button is held, fires yvz-repeat on the host after a short delay and then at a steady pace.
// Bind start/release/abandon to the inner button's pointer events.
export class HoldRepeat implements ReactiveController {
  private timer?: ReturnType<typeof setTimeout>;
  private repeated = false;

  constructor(
    private host: ReactiveControllerHost & HTMLElement,
    private enabled: () => boolean,
  ) {
    host.addController(this);
    // A hold that already repeated shouldn't also count as a click on release.
    host.addEventListener(
      "click",
      (e) => {
        if (!this.repeated) return;
        this.repeated = false;
        e.stopImmediatePropagation();
      },
      { capture: true },
    );
  }

  start = (): void => {
    if (!this.enabled()) return;
    this.repeated = false;
    const tick = (delay: number) => {
      this.timer = setTimeout(() => {
        this.repeated = true;
        this.host.dispatchEvent(new CustomEvent("yvz-repeat", { bubbles: true, composed: true }));
        tick(NEXT_MS);
      }, delay);
    };
    tick(FIRST_MS);
  };

  release = (): void => {
    clearTimeout(this.timer);
  };

  // Leaving or cancelling never produces a click, so there is nothing to swallow afterwards.
  abandon = (): void => {
    clearTimeout(this.timer);
    this.repeated = false;
  };

  hostDisconnected(): void {
    clearTimeout(this.timer);
  }
}
