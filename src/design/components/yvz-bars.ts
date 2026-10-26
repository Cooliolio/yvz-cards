import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";

export interface Bar {
  label: string;
  value: number;
  // What a screen reader and the hover title say.
  text?: string;
  // Short text above the bar, e.g. "3.4 h"; leave empty for none.
  display?: string;
  // The bar for "now"; drawn in the full state colour while the others are muted.
  current?: boolean;
  // A day that isn't over yet: hatched, because its bar will still grow.
  partial?: boolean;
}

const VALUE_HEIGHT = 16;
// Above this many bars the values would collide, so only the labels thin out and values hide.
const MAX_WITH_VALUES = 14;

// A row of vertical bars with a label under each; thin bars skip labels so they never overlap.
@customElement("yvz-bars")
export class YvzBars extends LitElement {
  @property({ attribute: false }) bars: Bar[] = [];
  // The value a full-height bar stands for. Larger than the biggest bar keeps a single active day from filling the chart.
  @property({ type: Number }) max?: number;
  @property({ type: Number }) height = 96;

  static override styles = [
    designStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }

      .row {
        display: flex;
        align-items: flex-end;
        gap: var(--_gap, 6px);
        height: var(--_height);
      }

      .col {
        display: flex;
        flex: 1;
        flex-direction: column;
        justify-content: flex-end;
        align-items: stretch;
        min-width: 0;
        height: 100%;
      }

      .value {
        height: ${VALUE_HEIGHT}px;
        overflow: visible;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-caption);
        font-variant-numeric: tabular-nums;
        line-height: ${VALUE_HEIGHT}px;
        text-align: center;
        white-space: nowrap;
      }

      .bar {
        height: calc((100% - var(--_valueh)) * var(--_ratio));
        min-height: 2px;
        border-radius: 3px 3px 1px 1px;
        background: color-mix(in srgb, var(--yvz-state, var(--yvz-accent)) 45%, transparent);
        transition:
          height var(--yvz-duration-slow) var(--yvz-ease),
          background var(--yvz-duration-base) var(--yvz-ease);
      }

      .col:hover .bar {
        background: var(--yvz-state, var(--yvz-accent));
      }

      .bar.current {
        background: var(--yvz-state, var(--yvz-accent));
      }

      .bar.partial {
        background: repeating-linear-gradient(
          135deg,
          color-mix(in srgb, var(--yvz-state, var(--yvz-accent)) 70%, transparent) 0 3px,
          color-mix(in srgb, var(--yvz-state, var(--yvz-accent)) 22%, transparent) 3px 6px
        );
      }

      .labels {
        display: flex;
        gap: var(--_gap, 6px);
        margin-top: var(--yvz-space-1);
      }

      .labels span {
        flex: 1;
        min-width: 0;
        overflow: visible;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-caption);
        line-height: var(--yvz-line-caption);
        text-align: center;
        white-space: nowrap;
      }
    `,
  ];

  protected override render() {
    const top = Math.max(this.max ?? 0, ...this.bars.map((b) => b.value), 0);
    const thin = this.bars.length > MAX_WITH_VALUES;
    const step = Math.ceil(this.bars.length / 6);
    return html`
      <div
        class="row"
        role="list"
        style="--_height: ${this.height}px; --_gap: ${thin ? 2 : 6}px; --_valueh: ${thin ? 0 : VALUE_HEIGHT}px"
      >
        ${this.bars.map(
          (b) => html`<div class="col" role="listitem" title=${b.text ?? String(b.value)} aria-label=${b.text ?? String(b.value)}>
            ${thin ? "" : html`<div class="value">${b.display ?? ""}</div>`}
            <div class="bar ${b.current ? "current" : ""} ${b.partial ? "partial" : ""}" style="--_ratio: ${top > 0 ? Math.max(0, b.value / top) : 0}"></div>
          </div>`,
        )}
      </div>
      <div class="labels" style="--_gap: ${thin ? 2 : 6}px" aria-hidden="true">
        ${this.bars.map((b, i) => html`<span>${!thin || i % step === 0 || b.current ? b.label : ""}</span>`)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-bars": YvzBars;
  }
}
