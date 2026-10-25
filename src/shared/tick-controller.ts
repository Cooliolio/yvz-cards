import type { ReactiveController, ReactiveControllerHost } from "lit";

export class TickController implements ReactiveController {
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly intervalMs: number,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    this.timer = setInterval(() => this.host.requestUpdate(), this.intervalMs);
  }

  hostDisconnected(): void {
    clearInterval(this.timer);
  }
}
