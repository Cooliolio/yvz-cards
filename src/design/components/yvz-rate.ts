import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";
import { NumberTween } from "../tween";

export interface RateSeries {
  value?: number;
  unit?: string;
  icon?: string;
}

const PEAK_HALF_LIFE_MS = 10 * 60_000;

// Rates have no natural maximum, so lines scale to a recent peak that slowly decays.
@customElement("yvz-rate")
export class YvzRate extends LitElement {
  @property() label = "";
  @property() locale = "";
  @property({ attribute: false }) series: RateSeries[] = [];
  // Hide the peak bars, e.g. when a trend line below already shows the same thing.
  @property({ type: Boolean }) bars = true;

  private tweens: NumberTween[] = [];
  private peak = 0;
  private peakAt = Date.now();

  static override styles = [
    designStyles,
    css`
      :host {
        display: block;
        min-width: 0;
        container-type: inline-size;
      }

      /* values drop below the label instead of squeezing it when the cell is narrow */
      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0 var(--yvz-space-3);
      }

      .label {
        max-width: 100%;
        overflow: hidden;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        line-height: var(--yvz-line-label);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .values {
        display: flex;
        gap: var(--yvz-space-3);
        margin-inline-start: auto;
        color: var(--yvz-text);
        font-size: var(--yvz-text-title);
        font-weight: var(--yvz-weight-medium);
        font-variant-numeric: tabular-nums;
        line-height: var(--yvz-line-title);
        white-space: nowrap;
      }

      .values span {
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }

      .values ha-icon {
        --mdc-icon-size: 14px;
        color: var(--yvz-text-muted);
      }

      /* below this width they always wrap, so neighbouring cells line up */
      @container (max-width: 239px) {
        .head {
          flex-direction: column;
          align-items: stretch;
        }

        .values {
          justify-content: flex-end;
        }
      }

      small {
        margin-inline-start: 2px;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        font-weight: var(--yvz-weight-regular);
      }

      .lines {
        display: flex;
        flex-direction: column;
        gap: 3px;
        margin-top: var(--yvz-space-2);
      }

      .line {
        height: 2px;
        border-radius: 1px;
        background: var(--yvz-divider);
      }

      .fill {
        height: 100%;
        border-radius: 1px;
        background: var(--yvz-text);
        transition: width var(--yvz-duration-slow) var(--yvz-ease);
      }

      .line:nth-child(n + 2) .fill {
        opacity: 0.5;
      }
    `,
  ];

  protected override willUpdate(): void {
    const now = Date.now();
    const current = Math.max(0, ...this.series.map((s) => s.value ?? 0));
    const decayed = this.peak * 0.5 ** ((now - this.peakAt) / PEAK_HALF_LIFE_MS);
    this.peak = Math.max(current, decayed);
    this.peakAt = now;
  }

  private format(value: number | undefined): string {
    if (value == null || Number.isNaN(value)) return "—";
    return value.toLocaleString(this.locale || undefined, { maximumFractionDigits: value < 10 ? 1 : 0 });
  }

  protected override render() {
    return html`
      <div class="head">
        <span class="label">${this.label}</span>
        <span class="values">
          ${this.series.map(
            (s, i) => html`<span>
              ${s.icon ? html`<ha-icon .icon=${s.icon}></ha-icon>` : nothing}${this.format(
                (this.tweens[i] ??= new NumberTween(this)).set(s.value),
              )}${s.unit
                ? html`<small>${s.unit}</small>`
                : nothing}
            </span>`,
          )}
        </span>
      </div>
      ${this.bars
        ? html`<div class="lines">
            ${this.series.map((s) => {
              const pct = this.peak > 0 && s.value != null ? Math.min(100, (s.value / this.peak) * 100) : 0;
              return html`<div class="line"><div class="fill" style="width: ${pct}%"></div></div>`;
            })}
          </div>`
        : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-rate": YvzRate;
  }
}
