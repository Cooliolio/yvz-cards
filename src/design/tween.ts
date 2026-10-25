import type { ReactiveController, ReactiveControllerHost } from "lit";

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// Eases a displayed number toward its latest value so readings glide instead of jumping.
export class NumberTween implements ReactiveController {
  value?: number;
  private from = 0;
  private to?: number;
  private start = 0;
  private frame = 0;

  constructor(
    private host: ReactiveControllerHost,
    private duration = 400,
  ) {
    host.addController(this);
  }

  // Call from render with the real value; returns the number to show this frame.
  set(target?: number): number | undefined {
    if (target === this.to) return this.value;
    const previous = this.value;
    this.to = target;
    cancelAnimationFrame(this.frame);
    if (target == null || Number.isNaN(target) || previous == null || reducedMotion()) {
      this.value = target;
      return target;
    }
    this.from = previous;
    this.start = performance.now();
    this.frame = requestAnimationFrame(this.step);
    return this.value;
  }

  private step = (now: number): void => {
    const p = Math.min(1, (now - this.start) / this.duration);
    this.value = this.from + (this.to! - this.from) * (1 - (1 - p) ** 3);
    this.host.requestUpdate();
    if (p < 1) this.frame = requestAnimationFrame(this.step);
  };

  hostDisconnected(): void {
    cancelAnimationFrame(this.frame);
    this.value = this.to;
  }
}
