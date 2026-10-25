import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";

// One line of a settings list: label on the left, the control (default slot) on the right.
@customElement("yvz-setting-row")
export class YvzSettingRow extends LitElement {
  @property() label = "";
  @property({ type: Boolean, reflect: true }) disabled = false;

  static override styles = [
    designStyles,
    css`
      :host {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--yvz-space-3);
        min-height: 56px;
        border-bottom: 1px solid var(--yvz-divider);
      }

      .label {
        min-width: 0;
        color: var(--yvz-text);
        font-size: var(--yvz-text-body);
      }

      :host([disabled]) .label {
        color: var(--yvz-text-muted);
      }

      :host([disabled]) slot {
        opacity: 0.5;
        pointer-events: none;
      }

      slot {
        display: flex;
        flex: none;
        align-items: center;
      }
    `,
  ];

  protected override render() {
    return html`<span class="label">${this.label}</span><slot></slot>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-setting-row": YvzSettingRow;
  }
}
