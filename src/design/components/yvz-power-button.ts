import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";
import type { ButtonStatus } from "./yvz-button";

export type PowerSize = "md" | "sm";

// A squircle power button in the surrounding state colour. It only draws; whoever uses it decides when
// a second tap is needed and sets `armed` while it waits (red ring), then reacts to the click.
@customElement("yvz-power-button")
export class YvzPowerButton extends LitElement {
  @property() icon = "mdi:power";
  @property() label = "";
  @property({ reflect: true }) size: PowerSize = "md";
  @property({ type: Boolean, reflect: true }) armed = false;
  @property({ reflect: true }) status: ButtonStatus = "idle";
  @property({ type: Boolean, reflect: true }) disabled = false;

  static override styles = [
    designStyles,
    css`
      :host {
        --_size: 68px;
        --_icon: 28px;
        display: inline-block;
        flex: none;
        width: var(--_size);
        height: var(--_size);
      }

      :host([size="sm"]) {
        --_size: 44px;
        --_icon: 20px;
      }

      button {
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        padding: 0;
        border: 0;
        border-radius: 35%;
        background: var(--yvz-state-soft, var(--yvz-accent-soft));
        color: var(--yvz-state, var(--yvz-accent));
        cursor: pointer;
        transition:
          background var(--yvz-duration-base) var(--yvz-ease),
          color var(--yvz-duration-base) var(--yvz-ease),
          box-shadow var(--yvz-duration-base) var(--yvz-ease),
          transform var(--yvz-duration-fast) var(--yvz-ease);
      }

      button:hover {
        background: var(--yvz-state-strong, var(--yvz-accent-strong));
      }

      button:active {
        transform: scale(var(--yvz-press-scale));
      }

      button:disabled {
        opacity: 0.5;
        cursor: default;
        pointer-events: none;
      }

      :host([armed]) button {
        background: var(--yvz-error-soft);
        box-shadow: inset 0 0 0 2px var(--yvz-error);
        color: var(--yvz-error);
      }

      :host([status="success"]) button {
        background: var(--yvz-on-soft);
        color: var(--yvz-on);
      }

      :host([status="error"]) button {
        background: var(--yvz-error-soft);
        color: var(--yvz-error);
      }

      ha-icon {
        --mdc-icon-size: var(--_icon);
      }
    `,
  ];

  protected override render() {
    const icon = this.status === "success" ? "mdi:check" : this.icon;
    return html`<button type="button" ?disabled=${this.disabled} aria-label=${this.label || nothing} aria-pressed=${this.armed}>
      <ha-icon .icon=${icon}></ha-icon>
    </button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-power-button": YvzPowerButton;
  }
}
