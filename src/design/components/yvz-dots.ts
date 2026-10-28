import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";

// Position dots for a swipeable strip. Tapping one emits yvz-select with its index.
@customElement("yvz-dots")
export class YvzDots extends LitElement {
  @property({ type: Number }) count = 0;
  @property({ type: Number }) current = 0;
  @property() label = "";

  static override styles = [
    designStyles,
    css`
      :host {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: var(--yvz-space-1);
      }

      button {
        display: grid;
        place-items: center;
        width: 20px;
        height: 20px;
        padding: 0;
        border: 0;
        background: none;
        cursor: pointer;
      }

      button::before {
        content: "";
        width: 6px;
        height: 6px;
        border-radius: 3px;
        background: var(--yvz-divider);
        transition:
          width var(--yvz-duration-base) var(--yvz-ease),
          background var(--yvz-duration-base) var(--yvz-ease);
      }

      button[aria-current="true"]::before {
        width: 16px;
        background: var(--yvz-state, var(--yvz-accent));
      }
    `,
  ];

  protected override render() {
    if (this.count < 2) return nothing;
    return html`${Array.from(
      { length: this.count },
      (_, i) => html`<button
        type="button"
        aria-label=${`${this.label} ${i + 1}`}
        aria-current=${i === this.current}
        @click=${() => this.dispatchEvent(new CustomEvent("yvz-select", { detail: { index: i }, bubbles: true, composed: true }))}
      ></button>`,
    )}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-dots": YvzDots;
  }
}
