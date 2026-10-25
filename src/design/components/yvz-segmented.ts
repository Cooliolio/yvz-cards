import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { YvzState } from "../palette";
import { designStyles } from "../styles";

export interface SegmentOption {
  value: string;
  label: string;
  icon?: string;
  // Colour of this option when selected; defaults to the surrounding --yvz-state.
  state?: YvzState;
}

// A row of mutually exclusive options with a highlight that slides to the picked one.
// Emits yvz-select with the picked value.
@customElement("yvz-segmented")
export class YvzSegmented extends LitElement {
  @property({ attribute: false }) options: SegmentOption[] = [];
  @property() value = "";
  @property() label = "";
  @property({ type: Boolean, reflect: true }) disabled = false;
  // Transparent track with a thin border instead of a filled one.
  @property({ type: Boolean, reflect: true }) outline = false;

  static override styles = [
    designStyles,
    css`
      :host {
        display: flex;
        position: relative;
        padding: var(--yvz-space-1);
        border-radius: var(--yvz-radius-md);
        background: var(--yvz-surface-raised);
      }

      :host([outline]) {
        background: none;
        box-shadow: inset 0 0 0 1px var(--yvz-divider);
      }

      .thumb {
        position: absolute;
        top: var(--yvz-space-1);
        bottom: var(--yvz-space-1);
        left: var(--yvz-space-1);
        width: calc((100% - 2 * var(--yvz-space-1)) / var(--_count));
        border-radius: calc(var(--yvz-radius-md) - 4px);
        background: var(--yvz-state, var(--yvz-accent));
        transform: translateX(calc(var(--_index) * 100%));
        transition:
          transform var(--yvz-duration-base) var(--yvz-ease),
          background var(--yvz-duration-base) var(--yvz-ease),
          opacity var(--yvz-duration-fast) var(--yvz-ease);
      }

      .thumb.none {
        opacity: 0;
      }

      :host([disabled]) .thumb {
        opacity: 0.5;
      }

      button {
        position: relative;
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        gap: var(--yvz-space-1);
        min-width: 0;
        height: var(--yvz-segmented-height, 40px);
        padding: 0 var(--yvz-space-3);
        border: 0;
        border-radius: calc(var(--yvz-radius-md) - 4px);
        background: none;
        color: var(--yvz-text-muted);
        font: inherit;
        font-size: var(--yvz-text-body);
        font-weight: var(--yvz-weight-medium);
        cursor: pointer;
        transition: color var(--yvz-duration-base) var(--yvz-ease);
      }

      button:hover {
        color: var(--yvz-text);
      }

      button[aria-checked="true"] {
        color: #fff;
      }

      button:disabled {
        opacity: 0.5;
        pointer-events: none;
      }

      button:focus-visible {
        outline-offset: -2px;
      }

      ha-icon {
        --mdc-icon-size: 18px;
      }
    `,
  ];

  private pick(value: string): void {
    if (value === this.value) return;
    this.dispatchEvent(new CustomEvent("yvz-select", { detail: { value }, bubbles: true, composed: true }));
  }

  protected override render() {
    const index = this.options.findIndex((o) => o.value === this.value);
    const picked = this.options[index];
    return html`
      <span
        class="thumb ${picked ? "" : "none"}"
        data-state=${picked?.state ?? ""}
        style="--_count: ${this.options.length || 1}; --_index: ${Math.max(0, index)}"
      ></span>
      <div role="radiogroup" aria-label=${this.label} style="display: contents">
        ${this.options.map(
          (o) => html`<button
            type="button"
            role="radio"
            aria-checked=${o.value === this.value}
            ?disabled=${this.disabled}
            @click=${() => this.pick(o.value)}
          >
            ${o.icon ? html`<ha-icon .icon=${o.icon}></ha-icon>` : ""}${o.label}
          </button>`,
        )}
      </div>
    `;
  }

}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-segmented": YvzSegmented;
  }
}
