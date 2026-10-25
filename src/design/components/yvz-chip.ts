import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";

@customElement("yvz-chip")
export class YvzChip extends LitElement {
  @property() icon = "";

  static override styles = [
    designStyles,
    css`
      :host {
        display: inline-flex;
        align-items: center;
        gap: var(--yvz-space-1);
        padding: 2px var(--yvz-space-2);
        border-radius: var(--yvz-radius-pill);
        background: var(--yvz-state-soft, var(--yvz-accent-soft));
        color: var(--yvz-state-text, var(--yvz-accent-text));
        font-size: var(--yvz-text-label);
        font-weight: var(--yvz-weight-medium);
        line-height: var(--yvz-line-label);
        white-space: nowrap;
        transition:
          background var(--yvz-duration-base) var(--yvz-ease),
          color var(--yvz-duration-base) var(--yvz-ease);
      }

      ha-icon {
        --mdc-icon-size: 14px;
      }
    `,
  ];

  protected override render() {
    return html`${this.icon ? html`<ha-icon .icon=${this.icon}></ha-icon>` : nothing}<slot></slot>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-chip": YvzChip;
  }
}
