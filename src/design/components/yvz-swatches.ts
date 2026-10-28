import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { designStyles } from "../styles";

export interface Swatch {
  // Any CSS colour.
  color: string;
  label: string;
  active?: boolean;
}

const MIN_SIZE = 32;
const GAP = 8;

// A row of colour buttons. As many as fit in one row are shown, growing to share the width.
// Tapping one emits yvz-select with its index in the full list.
@customElement("yvz-swatches")
export class YvzSwatches extends LitElement {
  @property({ attribute: false }) swatches: Swatch[] = [];
  @property({ type: Boolean, reflect: true }) disabled = false;
  @state() private fit = 0;

  private observer?: ResizeObserver;

  static override styles = [
    designStyles,
    css`
      :host {
        display: flex;
        gap: ${GAP}px;
        min-width: 0;
        min-height: ${MIN_SIZE}px;
      }

      button {
        flex: 1 1 ${MIN_SIZE}px;
        min-width: ${MIN_SIZE}px;
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

  override connectedCallback(): void {
    super.connectedCallback();
    this.observer = new ResizeObserver(() => this.measure());
    this.observer.observe(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.observer?.disconnect();
  }

  private measure(): void {
    const fit = Math.max(0, Math.floor((this.clientWidth + GAP) / (MIN_SIZE + GAP)));
    if (fit !== this.fit) this.fit = fit;
  }

  protected override firstUpdated(): void {
    this.measure();
  }

  protected override render() {
    // Before the first measurement everything shows, so nothing flashes in.
    const shown = this.fit > 0 ? this.swatches.slice(0, this.fit) : this.swatches;
    return html`${shown.map(
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
