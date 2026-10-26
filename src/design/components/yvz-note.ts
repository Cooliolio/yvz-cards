import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { YvzState } from "../palette";
import { designStyles } from "../styles";

export type NoteTone = "neutral" | "warning" | "error" | "info";

const TONES: Record<Exclude<NoteTone, "neutral">, YvzState> = {
  warning: "pending",
  error: "error",
  info: "standby",
};

// A one-line remark under some controls: an icon, the text, and optionally a thin progress bar.
// Quieter than a banner, which is for things that need attention.
@customElement("yvz-note")
export class YvzNote extends LitElement {
  @property() icon = "";
  @property({ reflect: true }) tone: NoteTone = "neutral";
  // 0..1 draws a thin bar after the text, e.g. how far an ignition is.
  @property({ type: Number }) progress?: number;

  static override styles = [
    designStyles,
    css`
      :host {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-2);
        padding: 6px var(--yvz-space-3);
        border-radius: var(--yvz-radius-sm);
        background: var(--yvz-surface-raised);
        color: var(--yvz-state-text, var(--yvz-text-muted));
        font-size: var(--yvz-text-label);
        line-height: var(--yvz-line-label);
        transition:
          background var(--yvz-duration-base) var(--yvz-ease),
          color var(--yvz-duration-base) var(--yvz-ease);
      }

      :host([tone="neutral"]) {
        color: var(--yvz-text-muted);
      }

      ha-icon {
        --mdc-icon-size: 16px;
        flex: none;
      }

      .text {
        min-width: 0;
      }

      .bar {
        flex: 1;
        min-width: 32px;
        height: 4px;
        overflow: hidden;
        border-radius: 2px;
        background: var(--yvz-surface);
      }

      .bar div {
        height: 100%;
        border-radius: inherit;
        background: var(--yvz-state, var(--yvz-accent));
        transition: width var(--yvz-duration-slow) var(--yvz-ease);
      }
    `,
  ];

  protected override willUpdate(): void {
    if (this.tone === "neutral") this.removeAttribute("data-state");
    else this.setAttribute("data-state", TONES[this.tone]);
  }

  protected override render() {
    const bar =
      this.progress == null
        ? nothing
        : html`<span class="bar"><div style="width: ${Math.min(100, Math.max(0, this.progress * 100))}%"></div></span>`;
    return html`${this.icon ? html`<ha-icon .icon=${this.icon}></ha-icon>` : nothing}<span class="text"><slot></slot></span>${bar}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-note": YvzNote;
  }
}
