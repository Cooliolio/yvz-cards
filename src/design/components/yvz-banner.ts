import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { YvzState } from "../palette";
import { designStyles } from "../styles";

export type BannerTone = "error" | "warning" | "info";

const TONES: Record<BannerTone, { state: YvzState; icon: string }> = {
  error: { state: "error", icon: "mdi:alert-circle" },
  warning: { state: "pending", icon: "mdi:alert" },
  info: { state: "standby", icon: "mdi:information" },
};

// Inline notice inside a card; the message goes in the default slot.
@customElement("yvz-banner")
export class YvzBanner extends LitElement {
  @property({ reflect: true }) tone: BannerTone = "warning";
  @property() icon = "";

  static override styles = [
    designStyles,
    css`
      :host {
        display: flex;
        align-items: flex-start;
        gap: var(--yvz-space-2);
        padding: 10px var(--yvz-space-3);
        border-radius: var(--yvz-radius-md);
        background: var(--yvz-state-soft);
        color: var(--yvz-state-text);
        font-size: var(--yvz-text-body);
        line-height: var(--yvz-line-body);
      }

      ha-icon {
        --mdc-icon-size: 18px;
        flex: none;
        margin-top: 1px;
        color: var(--yvz-state);
      }
    `,
  ];

  protected override willUpdate(): void {
    this.setAttribute("data-state", TONES[this.tone].state);
    this.setAttribute("role", this.tone === "error" ? "alert" : "status");
  }

  protected override render() {
    return html`<ha-icon .icon=${this.icon || TONES[this.tone].icon}></ha-icon><span><slot></slot></span>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-banner": YvzBanner;
  }
}
