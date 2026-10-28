import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";

export interface Swatch {
  // Any CSS colour.
  color: string;
  label: string;
  active?: boolean;
}

const MIN_SIZE = 28;
const GAP = 8;

// Colour buttons in a grid: all of them are shown, as many to a row as fit, and they wrap onto the next row
// instead of being cut.
// Tapping one emits yvz-select with its index in the full list.
@customElement("yvz-swatches")
export class YvzSwatches extends LitElement {
  @property({ attribute: false }) swatches: Swatch[] = [];
  @property({ type: Boolean, reflect: true }) disabled = false;
  static override styles = [
    designStyles,
    css`
      :host {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(${MIN_SIZE}px, 1fr));
        gap: ${GAP}px;
        min-width: 0;
      }

      button {
        min-width: 0;
        height: ${MIN_SIZE}px;
        padding: 0;
        border: 0;
        border-radius: var(--yvz-radius-md);
        background: var(--_color);
        box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.18);
        cursor: pointer;
        transition:
          box-shadow var(--yvz-duration-fast) var(--yvz-ease),
          transform var(--yvz-duration-fast) var(--yvz-ease);
      }

      button:active {
        transform: scale(var(--yvz-press-scale));
      }

      button[aria-pressed="true"] {
        /* drawn inside the button, so a parent that clips its content can't cut the ring off */
        box-shadow:
          inset 0 0 0 2px var(--yvz-text),
          inset 0 0 0 4px var(--yvz-surface);
      }

      button:disabled {
        opacity: 0.5;
        cursor: default;
        pointer-events: none;
      }
    `,
  ];

  protected override render() {
    return html`${this.swatches.map(
      (s, i) => html`<button
        type="button"
        style="--_color: ${s.color}"
        aria-label=${s.label}
        title=${s.label}
        aria-pressed=${s.active ?? false}
        ?disabled=${this.disabled}
        @click=${() => this.dispatchEvent(new CustomEvent("yvz-select", { detail: { index: i }, bubbles: true, composed: true }))}
      ></button>`,
    )}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-swatches": YvzSwatches;
  }
}
