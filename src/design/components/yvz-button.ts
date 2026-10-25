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
  // Transparent with a thin border until active; for rows of options where only one is on.
  @property({ type: Boolean, reflect: true }) outline = false;
  @property({ type: Boolean, reflect: true }) disabled = false;
  @property({ reflect: true }) status: ButtonStatus = "idle";
  @property() label = "";
  // 0..1 draws a thin bar along the bottom, e.g. time left.
  @property({ type: Number }) progress?: number;


  static override styles = [
    designStyles,
    css`
      :host {
        display: block;
      }

      button {
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--yvz-space-1);
        width: 100%;
        min-height: var(--yvz-button-height, 40px);
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
          box-shadow var(--yvz-duration-fast) var(--yvz-ease),
          transform var(--yvz-duration-fast) var(--yvz-ease);
      }

      button:hover {
        background: color-mix(in srgb, var(--yvz-surface-raised) 85%, var(--yvz-text));
      }

      button:active {
        transform: scale(var(--yvz-press-scale));
      }

      button:disabled {
        opacity: 0.5;
        cursor: default;
        pointer-events: none;
      }

      :host([tone="danger"]) button {
        color: var(--yvz-error-text);
      }

      :host([outline]) button {
        background: none;
        box-shadow: inset 0 0 0 1px var(--yvz-divider);
      }

      :host([outline]) button:hover {
        background: color-mix(in srgb, var(--yvz-text) 6%, transparent);
      }

      :host([active]) button {
        background: var(--yvz-state, var(--yvz-accent));
        box-shadow: none;
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

      .progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: currentColor;
        opacity: 0.6;
        transition: width var(--yvz-duration-slow) linear;
      }
    `,
  ];

  protected override render() {
    return html`
      <button type="button" ?disabled=${this.disabled} aria-label=${this.label || nothing}>
        ${this.icon ? html`<ha-icon .icon=${this.icon}></ha-icon>` : nothing}<slot></slot>
        ${this.progress == null
          ? nothing
          : html`<span class="progress" style="width: ${Math.min(1, Math.max(0, this.progress)) * 100}%"></span>`}
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-button": YvzButton;
  }
}
