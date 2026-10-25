import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";

@customElement("yvz-progress")
export class YvzProgress extends LitElement {
  @property({ type: Number }) value = 0;

  static override styles = [
    designStyles,
    css`
      :host {
        display: block;
        height: 6px;
        overflow: hidden;
        border-radius: var(--yvz-radius-pill);
        background: var(--yvz-surface-raised);
      }

      .fill {
        width: 100%;
        height: 100%;
        border-radius: inherit;
        background: var(--yvz-state, var(--yvz-accent));
        transform-origin: left;
        transition:
          transform var(--yvz-duration-slow) var(--yvz-ease),
          background var(--yvz-duration-base) var(--yvz-ease);
      }
    `,
  ];

  protected override render() {
    const pct = Math.min(100, Math.max(0, this.value || 0));
    this.setAttribute("role", "progressbar");
    this.setAttribute("aria-valuemin", "0");
    this.setAttribute("aria-valuemax", "100");
    this.setAttribute("aria-valuenow", String(Math.round(pct)));
    return html`<div class="fill" style="transform: scaleX(${pct / 100})"></div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-progress": YvzProgress;
  }
}
