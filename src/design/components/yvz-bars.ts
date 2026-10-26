import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";

export interface Bar {
  label: string;
  value: number;
  // What a screen reader and the hover title say.
  text?: string;
  // The bar for "now"; drawn in the state colour while the others are muted.
  current?: boolean;
}

// A row of vertical bars with a label under each; thin bars skip labels so they never overlap.
@customElement("yvz-bars")
export class YvzBars extends LitElement {
  @property({ attribute: false }) bars: Bar[] = [];
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
        align-items: flex-end;
        min-width: 0;
        height: 100%;
      }

      .bar {
        width: 100%;
        min-height: 2px;
        border-radius: 3px 3px 1px 1px;
        background: color-mix(in srgb, var(--yvz-state, var(--yvz-accent)) 45%, transparent);
        transition:
          height var(--yvz-duration-slow) var(--yvz-ease),
          background var(--yvz-duration-base) var(--yvz-ease);
      }

      .col:hover .bar,
      .bar.current {
        background: var(--yvz-state, var(--yvz-accent));
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
    const top = this.max ?? Math.max(...this.bars.map((b) => b.value), 0);
    const thin = this.bars.length > 14;
    const step = Math.ceil(this.bars.length / 6);
    return html`
      <div class="row" role="list" style="--_height: ${this.height}px; --_gap: ${thin ? 2 : 6}px">
        ${this.bars.map(
          (b) => html`<div class="col" role="listitem" title=${b.text ?? String(b.value)} aria-label=${b.text ?? String(b.value)}>
            <div class="bar ${b.current ? "current" : ""}" style="height: ${top > 0 ? Math.max(0, (b.value / top) * 100) : 0}%"></div>
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
