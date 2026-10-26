import { css, html, LitElement, nothing, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { designStyles } from "../styles";

export interface TimelinePoint {
  t: number;
  v: number;
}

// Pump on/off as a strip, with a setpoint (stepped) and a temperature line above it.
@customElement("yvz-timeline")
export class YvzTimeline extends LitElement {
  // The ms the chart spans.
  @property({ type: Number }) from = 0;
  @property({ type: Number }) to = 0;
  // [start, end] ms of every run.
  @property({ attribute: false }) runs: [number, number][] = [];
  @property({ attribute: false }) setpoint: TimelinePoint[] = [];
  @property({ attribute: false }) temperature: TimelinePoint[] = [];
  @property({ type: Number }) height = 140;
  @property() locale = "";
  @property() unit = "°";
  @state() private hover?: number;

  static override styles = [
    designStyles,
    css`
      :host {
        display: block;
        position: relative;
        min-width: 0;
      }

      svg {
        display: block;
        width: 100%;
        overflow: visible;
      }

      .run {
        fill: var(--yvz-heat);
        opacity: 0.9;
      }

      .strip {
        fill: var(--yvz-surface-raised);
      }

      .temp,
      .set {
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
      }

      .temp {
        stroke: var(--yvz-text);
        stroke-width: 1.75;
      }

      .set {
        stroke: var(--yvz-text-muted);
        stroke-dasharray: 3 3;
        stroke-width: 1.25;
      }

      .grid {
        stroke: var(--yvz-divider);
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }

      .axis {
        display: flex;
        justify-content: space-between;
        margin-top: var(--yvz-space-1);
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-caption);
        line-height: var(--yvz-line-caption);
      }

      .scale {
        position: absolute;
        top: 0;
        inset-inline-start: 0;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-caption);
        line-height: var(--yvz-line-caption);
        pointer-events: none;
      }

      .guide {
        position: absolute;
        top: 0;
        width: 1px;
        background: var(--yvz-divider);
        pointer-events: none;
      }

      .tip {
        position: absolute;
        top: 0;
        z-index: 1;
        padding: 2px 6px;
        border-radius: var(--yvz-radius-sm);
        background: var(--yvz-surface-raised);
        box-shadow: 0 1px 4px rgb(0 0 0 / 0.25);
        font-size: var(--yvz-text-caption);
        line-height: var(--yvz-line-caption);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        pointer-events: none;
      }

      .tip time {
        margin-inline-end: 6px;
        color: var(--yvz-text-muted);
      }
    `,
  ];

  private valueAt(points: TimelinePoint[], t: number): number | undefined {
    let found: number | undefined;
    for (const p of points) {
      if (p.t > t) break;
      found = p.v;
    }
    return found ?? points[0]?.v;
  }

  private fmt(v: number): string {
    return `${v.toLocaleString(this.locale || undefined, { maximumFractionDigits: 1 })}${this.unit}`;
  }

  private time(t: number, long = false): string {
    return new Intl.DateTimeFormat(this.locale || undefined, {
      ...(long || this.to - this.from > 36 * 3_600_000 ? { weekday: "short" } : {}),
      hour: "2-digit",
      minute: "2-digit",
    }).format(t);
  }

  private onMove(e: PointerEvent): void {
    const rect = this.getBoundingClientRect();
    this.hover = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  }

  protected override render() {
    const span = this.to - this.from || 1;
    const x = (t: number) => (Math.min(this.to, Math.max(this.from, t)) - this.from) / span * 100;
    const stripH = 12;
    const gap = 8;
    const plot = this.height - stripH - gap;
    // The scale follows the room line. A target outside it (a frost setpoint) is clipped, not stretched to.
    const own = this.temperature.length ? this.temperature : this.setpoint;
    const all = own.map((p) => p.v);
    let lo = all.length ? Math.floor(Math.min(...all) - 0.25) : 0;
    let hi = all.length ? Math.ceil(Math.max(...all) + 0.25) : 1;
    if (hi - lo < 2) {
      lo -= 1;
      hi += 1;
    }
    const y = (v: number) => 2 + (1 - (v - lo) / (hi - lo || 1)) * (plot - 4);
    const line = (pts: TimelinePoint[], stepped = false): string =>
      pts
        .map((p, i) => {
          const px = x(p.t).toFixed(2);
          const prev = pts[i - 1];
          if (!i) return `M${px},${y(p.v).toFixed(2)}`;
          return stepped ? `L${px},${y(prev.v).toFixed(2)} L${px},${y(p.v).toFixed(2)}` : `L${px},${y(p.v).toFixed(2)}`;
        })
        .join(" ") + (stepped && pts.length ? ` L100,${y(pts[pts.length - 1].v).toFixed(2)}` : "");
    const at = this.hover == null ? undefined : this.from + this.hover * span;
    const running = at == null ? false : this.runs.some(([a, b]) => at >= a && at <= b);
    const temp = at == null ? undefined : this.valueAt(this.temperature, at);
    const set = at == null ? undefined : this.valueAt(this.setpoint, at);
    return html`
      <svg
        viewBox="0 0 100 ${this.height}"
        preserveAspectRatio="none"
        style="height: ${this.height}px"
        aria-hidden="true"
        @pointermove=${this.onMove}
        @pointerleave=${() => (this.hover = undefined)}
      >
        <defs>
          <clipPath id="plot"><rect x="0" y="0" width="100" height=${plot}></rect></clipPath>
        </defs>
        <line class="grid" x1="0" x2="100" y1=${y(hi)} y2=${y(hi)}></line>
        <line class="grid" x1="0" x2="100" y1=${y(lo)} y2=${y(lo)}></line>
        ${this.setpoint.length ? svg`<g clip-path="url(#plot)"><path class="set" d=${line(this.setpoint, true)}></path></g>` : nothing}
        ${this.temperature.length ? svg`<path class="temp" d=${line(this.temperature)}></path>` : nothing}
        <rect class="strip" x="0" y=${plot + gap} width="100" height=${stripH} rx="1.5"></rect>
        ${this.runs.map(
          ([a, b]) => svg`<rect class="run" x=${x(a)} y=${plot + gap} width=${Math.max(0.25, x(b) - x(a))} height=${stripH}></rect>`,
        )}
      </svg>
      ${all.length
        ? html`<div class="scale" style="height: ${plot}px"><span>${this.fmt(hi)}</span><span>${this.fmt(lo)}</span></div>`
        : nothing}
      <div class="axis" aria-hidden="true">
        <span>${this.time(this.from)}</span><span>${this.time(this.to)}</span>
      </div>
      ${at == null
        ? nothing
        : html`<i class="guide" style="left: ${this.hover! * 100}%; height: ${this.height}px"></i>
            <div class="tip" style="left: ${Math.min(Math.max(this.hover! * 100, 18), 82)}%; transform: translateX(-50%)">
              <time>${this.time(at)}</time>${[
                temp == null ? "" : this.fmt(temp),
                set == null ? "" : `→ ${this.fmt(set)}`,
                running ? "●" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            </div>`}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-timeline": YvzTimeline;
  }
}
