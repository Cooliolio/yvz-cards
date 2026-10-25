import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";

export interface StackPart {
  label: string;
  value: number;
}

// Part opacities fade so a stack reads as one monochrome bar.
const OPACITIES = [1, 0.6, 0.35, 0.2];

@customElement("yvz-stack")
export class YvzStack extends LitElement {
  @property() label = "";
  @property() unit = "";
  @property() locale = "";
  @property({ type: Number }) total?: number;
  @property({ attribute: false }) parts: StackPart[] = [];

  static override styles = [
    designStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }

      .head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--yvz-space-2);
      }

      .label {
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        line-height: var(--yvz-line-label);
      }

      .sum {
        color: var(--yvz-text);
        font-size: var(--yvz-text-title);
        font-weight: var(--yvz-weight-medium);
        font-variant-numeric: tabular-nums;
        line-height: var(--yvz-line-title);
        white-space: nowrap;
      }

      small {
        margin-inline-start: 2px;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        font-weight: var(--yvz-weight-regular);
      }

      .bar {
        display: flex;
        gap: 2px;
        height: 4px;
        margin-top: var(--yvz-space-2);
        overflow: hidden;
        border-radius: 2px;
        background: var(--yvz-divider);
      }

      .part {
        background: var(--yvz-text);
        transition: width var(--yvz-duration-slow) var(--yvz-ease);
      }

      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: var(--yvz-space-1) var(--yvz-space-3);
        margin-top: var(--yvz-space-2);
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-caption);
        line-height: var(--yvz-line-caption);
      }

      .legend span {
        display: inline-flex;
        align-items: center;
        gap: var(--yvz-space-1);
      }

      .legend i {
        width: 6px;
        height: 6px;
        border-radius: 2px;
        background: var(--yvz-text);
      }
    `,
  ];

  private format(value: number): string {
    return value.toLocaleString(this.locale || undefined, { maximumFractionDigits: 0 });
  }

  protected override render() {
    const used = this.parts.reduce((sum, p) => sum + p.value, 0);
    const total = this.total ?? used;
    return html`
      <div class="head">
        <span class="label">${this.label}</span>
        <span class="sum">${this.format(used)}${this.total != null ? ` / ${this.format(total)}` : ""}<small>${this.unit}</small></span>
      </div>
      <div class="bar">
        ${this.parts.map(
          (p, i) =>
            html`<div
              class="part"
              style="width: ${total > 0 ? (p.value / total) * 100 : 0}%; opacity: ${OPACITIES[Math.min(i, OPACITIES.length - 1)]}"
            ></div>`,
        )}
      </div>
      <div class="legend">
        ${this.parts.map(
          (p, i) => html`<span>
            <i style="opacity: ${OPACITIES[Math.min(i, OPACITIES.length - 1)]}"></i>${p.label} ${this.format(p.value)}
          </span>`,
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-stack": YvzStack;
  }
}
