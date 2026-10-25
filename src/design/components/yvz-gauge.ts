import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { YvzState } from "../palette";
import { designStyles } from "../styles";
import { NumberTween } from "../tween";

export type GaugeVariant = "line" | "stat" | "segments";

const SEGMENTS = 20;

interface GaugeThresholds {
  value?: number;
  warnAt?: number;
  errorAt?: number;
  invert?: boolean;
}

interface Zone {
  from: number;
  to: number;
  state: "pending" | "error";
}

// Maps a value to a state; with invert, low values are the bad ones (e.g. battery).
export function gaugeState({ value, warnAt, errorAt, invert }: GaugeThresholds): YvzState {
  if (value == null || Number.isNaN(value)) return "unavailable";
  if (warnAt == null && errorAt == null) return "accent";
  const past = (limit: number) => (invert ? value <= limit : value >= limit);
  if (errorAt != null && past(errorAt)) return "error";
  if (warnAt != null && past(warnAt)) return "pending";
  return "on";
}

@customElement("yvz-gauge")
export class YvzGauge extends LitElement {
  @property({ type: Number }) value?: number;
  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 100;
  @property() label = "";
  @property() unit = "%";
  @property() locale = "";
  @property({ type: Number }) decimals = 0;
  @property({ reflect: true }) variant: GaugeVariant = "line";
  @property({ type: Number, attribute: "warn-at" }) warnAt?: number;
  @property({ type: Number, attribute: "error-at" }) errorAt?: number;
  @property({ type: Boolean }) invert = false;
  @property({ type: Number }) target?: number;
  @property() display = "";
  @property() tone?: YvzState;
  @property() icon = "";

  private tween = new NumberTween(this);

  static override styles = [
    designStyles,
    css`
      :host {
        --_tone: var(--yvz-text);
        --_value: var(--yvz-text);
        --_icon: var(--yvz-text-muted);
        display: block;
        min-width: 0;
      }

      /* line stays neutral while healthy; colour only shows up when it matters */
      :host([data-state="pending"]) {
        --_tone: var(--yvz-pending);
        --_value: var(--yvz-pending-text);
        --_icon: var(--yvz-pending);
      }

      :host([data-state="error"]) {
        --_tone: var(--yvz-error);
        --_value: var(--yvz-error-text);
        --_icon: var(--yvz-error);
      }

      :host([data-state="unavailable"]) {
        --_tone: var(--yvz-text-muted);
        --_value: var(--yvz-text-muted);
      }

      .name {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }

      .name ha-icon {
        --mdc-icon-size: 16px;
        flex: none;
        color: var(--_icon);
        transition: color var(--yvz-duration-base) var(--yvz-ease);
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
        color: var(--_value);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        transition: color var(--yvz-duration-base) var(--yvz-ease);
      }

      .value small {
        margin-inline-start: 2px;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        font-weight: var(--yvz-weight-regular);
      }

      .fill {
        position: relative;
        height: 100%;
        border-radius: 1px;
        background: var(--_tone);
        transition:
          width var(--yvz-duration-slow) var(--yvz-ease),
          background var(--yvz-duration-base) var(--yvz-ease);
      }

      /* line */
      .head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--yvz-space-2);
      }

      :host([variant="line"]) .value,
      :host([variant="stat"]) .value {
        font-size: var(--yvz-text-title);
        font-weight: var(--yvz-weight-medium);
        line-height: var(--yvz-line-title);
      }

      .line {
        position: relative;
        height: 2px;
        margin-top: var(--yvz-space-2);
        border-radius: 1px;
        background: var(--yvz-divider);
      }

      /* faint tint where the warning and error ranges start, so the headroom is visible */
      .zone {
        position: absolute;
        top: 0;
        height: 100%;
      }

      .zone.pending {
        background: var(--yvz-pending-strong);
      }

      .zone.error {
        background: var(--yvz-error-strong);
      }

      .target {
        position: absolute;
        top: -3px;
        width: 2px;
        height: 8px;
        border-radius: 1px;
        background: var(--yvz-text-muted);
        transform: translateX(-50%);
      }

      /* segments */
      :host([variant="segments"]) .value {
        font-size: var(--yvz-text-value);
        font-weight: var(--yvz-weight-medium);
        line-height: var(--yvz-line-value);
      }

      .segments {
        display: grid;
        grid-template-columns: repeat(${SEGMENTS}, 1fr);
        gap: 2px;
        height: 14px;
        margin-top: var(--yvz-space-2);
      }

      .segments i {
        border-radius: 2px;
        background: var(--yvz-surface-raised);
        transition: background var(--yvz-duration-base) var(--yvz-ease);
      }

      .segments i.pending {
        background: var(--yvz-pending-soft);
      }

      .segments i.error {
        background: var(--yvz-error-soft);
      }

      .segments i.lit {
        background: var(--_tone);
      }
    `,
  ];

  private get available(): boolean {
    return this.value != null && !Number.isNaN(this.value);
  }

  private get fraction(): number {
    if (!this.available) return 0;
    return this.position(this.value!) / 100;
  }

  private position(v: number): number {
    const span = this.max - this.min || 1;
    return Math.min(100, Math.max(0, ((v - this.min) / span) * 100));
  }

  private get zones(): Zone[] {
    const warn = this.warnAt == null ? undefined : this.position(this.warnAt);
    const error = this.errorAt == null ? undefined : this.position(this.errorAt);
    const zones: (Zone | false)[] = this.invert
      ? [error != null && { from: 0, to: error, state: "error" }, warn != null && { from: error ?? 0, to: warn, state: "pending" }]
      : [warn != null && { from: warn, to: error ?? 100, state: "pending" }, error != null && { from: error, to: 100, state: "error" }];
    return zones.filter((z): z is Zone => !!z && z.to > z.from);
  }

  private zoneAt(pct: number, zones: Zone[]): string {
    return zones.find((z) => pct >= z.from && pct < z.to)?.state ?? "";
  }

  private get text(): string {
    if (this.display) return this.display;
    const shown = this.tween.set(this.value);
    if (!this.available || shown == null) return "—";
    return shown.toLocaleString(this.locale || undefined, {
      minimumFractionDigits: this.decimals,
      maximumFractionDigits: this.decimals,
    });
  }

  private renderValue() {
    const unit = this.available && !this.display && this.unit ? html`<small>${this.unit}</small>` : nothing;
    return html`<span class="value">${this.text}${unit}</span>`;
  }

  protected override willUpdate(): void {
    this.setAttribute("data-state", this.tone ?? gaugeState(this));
    this.setAttribute("role", "meter");
    this.setAttribute("aria-label", this.label);
    this.setAttribute("aria-valuemin", String(this.min));
    this.setAttribute("aria-valuemax", String(this.max));
    if (this.available) this.setAttribute("aria-valuenow", String(this.value));
  }

  private renderHead() {
    return html`<div class="head">
      <span class="name">
        ${this.icon ? html`<ha-icon .icon=${this.icon}></ha-icon>` : nothing}<span class="label">${this.label}</span>
      </span>
      ${this.renderValue()}
    </div>`;
  }

  protected override render() {
    const pct = this.fraction * 100;
    switch (this.variant) {
      case "stat":
        return this.renderHead();
      case "segments": {
        const lit = this.fraction > 0 ? Math.max(1, Math.round(this.fraction * SEGMENTS)) : 0;
        const zones = this.zones;
        return html`
          ${this.renderHead()}
          <div class="segments">
            ${Array.from(
              { length: SEGMENTS },
              (_, i) => html`<i class=${i < lit ? "lit" : this.zoneAt(((i + 0.5) / SEGMENTS) * 100, zones)}></i>`,
            )}
          </div>
        `;
      }
      default:
        return html`
          ${this.renderHead()}
          <div class="line">
            ${this.zones.map((z) => html`<i class="zone ${z.state}" style="left: ${z.from}%; width: ${z.to - z.from}%"></i>`)}
            <div class="fill" style="width: ${pct}%"></div>
            ${this.target == null
              ? nothing
              : html`<span class="target" style="left: ${this.position(this.target)}%"></span>`}
          </div>
        `;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-gauge": YvzGauge;
  }
}
