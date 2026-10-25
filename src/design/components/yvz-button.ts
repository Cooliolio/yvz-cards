import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";

export type ButtonTone = "default" | "danger";
export type ButtonStatus = "idle" | "success" | "error";

@customElement("yvz-button")
export class YvzButton extends LitElement {
  @property() icon = "";
  @property({ reflect: true }) tone: ButtonTone = "default";
  @property({ type: Boolean, reflect: true }) active = false;
  @property({ type: Boolean, reflect: true }) disabled = false;
  @property({ reflect: true }) status: ButtonStatus = "idle";
  @property() label = "";

  static override styles = [
    designStyles,
    css`
      :host {
        display: block;
      }

      button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--yvz-space-1);
        width: 100%;
        min-height: 40px;
        padding: 0 var(--yvz-space-3);
        border: 0;
        border-radius: var(--yvz-radius-md);
        background: var(--yvz-surface-raised);
        color: var(--yvz-text);
        font: inherit;
        font-size: var(--yvz-text-body);
        cursor: pointer;
        transition:
          background var(--yvz-duration-fast) var(--yvz-ease),
          color var(--yvz-duration-fast) var(--yvz-ease),
          transform var(--yvz-duration-fast) var(--yvz-ease);
      }

      button:hover {
        background: color-mix(in srgb, var(--yvz-surface-raised) 85%, var(--yvz-text));
      }

      button:active {
        transform: scale(0.97);
      }

      button:disabled {
        opacity: 0.5;
        cursor: default;
        pointer-events: none;
      }

      :host([tone="danger"]) button {
        color: var(--yvz-error-text);
      }

      :host([active]) button {
        background: var(--yvz-state, var(--yvz-accent));
        color: #fff;
      }

      :host([tone="danger"][active]) button {
        background: var(--yvz-error);
        color: #fff;
      }

      :host([status="success"]) button {
        background: var(--yvz-on);
        color: #fff;
      }

      :host([status="error"]) button {
        background: var(--yvz-error);
        color: #fff;
      }

      ha-icon {
        --mdc-icon-size: 18px;
        flex: none;
      }
    `,
  ];

  protected override render() {
    return html`
      <button type="button" ?disabled=${this.disabled} aria-label=${this.label || nothing}>
        ${this.icon ? html`<ha-icon .icon=${this.icon}></ha-icon>` : nothing}<slot></slot>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-button": YvzButton;
  }
}
