import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";

export type StatTrend = "up" | "down" | "flat";

// A key figure: label, a big value and, optionally, how it moved against the previous period.
@customElement("yvz-stat")
export class YvzStat extends LitElement {
  @property() label = "";
  @property() value = "";
  @property() unit = "";
  // Already formatted, e.g. "12 min"; leave empty to hide the change.
  @property() delta = "";
  @property() trend: StatTrend = "flat";
  // A quieter line under the change, e.g. a percentage.
  @property() note = "";

  static override styles = [
    designStyles,
    css`
      :host {
        display: block;
        min-width: 0;
        padding: var(--yvz-space-3);
        border-radius: var(--yvz-radius-md);
        background: var(--yvz-surface-raised);
      }

      .label {
        overflow: hidden;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        line-height: var(--yvz-line-label);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .value {
        margin-top: var(--yvz-space-1);
        overflow: hidden;
        font-size: var(--yvz-text-value);
        font-variant-numeric: tabular-nums;
        font-weight: var(--yvz-weight-medium);
        line-height: var(--yvz-line-value);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .value small {
        margin-inline-start: 2px;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-body);
        font-weight: var(--yvz-weight-regular);
      }

      .delta {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-1);
        min-height: var(--yvz-line-label);
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        font-variant-numeric: tabular-nums;
        line-height: var(--yvz-line-label);
        white-space: nowrap;
      }

      .note {
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        line-height: var(--yvz-line-label);
        white-space: nowrap;
      }

      .arrow {
        font-size: 8px;
      }
    `,
  ];

  protected override render() {
    const arrow = this.trend === "up" ? "▲" : this.trend === "down" ? "▼" : "";
    return html`
      <div class="label">${this.label}</div>
      <div class="value">${this.value}${this.unit && this.value !== "–" ? html`<small>${this.unit}</small>` : nothing}</div>
      <div class="delta">${this.delta ? html`<span class="arrow" aria-hidden="true">${arrow}</span>${this.delta}` : nothing}</div>
      ${this.note ? html`<div class="note">${this.note}</div>` : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-stat": YvzStat;
  }
}
