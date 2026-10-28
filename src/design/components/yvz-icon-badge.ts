import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";

export type IconBadgeSize = "sm" | "md" | "lg";

@customElement("yvz-icon-badge")
export class YvzIconBadge extends LitElement {
  @property() icon = "";
  @property({ reflect: true }) size: IconBadgeSize = "md";

  static override styles = [
    designStyles,
    css`
      :host {
        --_size: 34px;
        --_icon: 20px;
        display: inline-flex;
        flex: none;
        align-items: center;
        justify-content: center;
        width: var(--yvz-badge-size, var(--_size));
        height: var(--yvz-badge-size, var(--_size));
        border-radius: 50%;
        background: var(--yvz-state-soft, var(--yvz-accent-soft));
        color: var(--yvz-state, var(--yvz-accent));
        transition:
          background var(--yvz-duration-base) var(--yvz-ease),
          color var(--yvz-duration-base) var(--yvz-ease);
      }

      :host([size="sm"]) {
        --_size: 28px;
        --_icon: 16px;
      }

      :host([size="lg"]) {
        --_size: 48px;
        --_icon: 26px;
      }

      ha-icon {
        --mdc-icon-size: var(--yvz-badge-icon, var(--_icon));
      }
    `,
  ];

  protected override render() {
    return html`<ha-icon .icon=${this.icon}></ha-icon>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-icon-badge": YvzIconBadge;
  }
}
