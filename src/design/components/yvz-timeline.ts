import { css, html, LitElement, nothing, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { clusterPins, NEUTRAL, type Pin, type PinCluster } from "../pins";
import { designStyles } from "../styles";

// The strip under the chart where the pins sit.
const LANE_H = 34;

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
  // Optional faint line for the outdoor temperature, on a scale of its own at the right edge.
  @property({ attribute: false }) outdoor: TimelinePoint[] = [];
  // What the tooltip calls it, e.g. "Outside".
  @property({ attribute: "outdoor-label" }) outdoorLabel = "";
  @property({ type: Number }) height = 140;
  @property() locale = "";
  @property() unit = "°";
  // Changes by people and automations, drawn as pins under the pump strip.
  @property({ attribute: false }) pins: Pin[] = [];
  // "4 changes until 11:37 PM", for a pin that stands for several.
  @property({ attribute: false }) clusterText: (count: number, until: number) => string = (count) => String(count);
  @property({ attribute: "pins-label" }) pinsLabel = "";
  @state() private hover?: number;
  @state() private width = 0;
  @state() private openKey?: string;

  private observer?: ResizeObserver;

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
        fill: var(--yvz-accent);
        opacity: 0.9;
      }

      .strip {
        fill: var(--yvz-surface-raised);
      }

      .temp,
      .set,
      .out {
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
      }

      .temp {
        stroke: var(--yvz-text);
        stroke-width: 1.75;
      }

      .out {
        stroke: var(--yvz-standby, var(--yvz-text-muted));
        stroke-width: 1.25;
        opacity: 0.55;
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

      .scale.right {
        inset-inline-start: auto;
        inset-inline-end: 0;
        align-items: flex-end;
        opacity: 0.7;
      }

      .lane {
        position: relative;
        height: ${LANE_H}px;
        margin-top: 2px;
        border-radius: var(--yvz-radius-sm);
        background: var(--yvz-surface);
      }

      .pin {
        position: absolute;
        top: ${(LANE_H - 44) / 2}px;
        display: grid;
        width: 44px;
        height: 44px;
        margin-inline-start: -22px;
        padding: 0;
        border: 0;
        background: none;
        color: inherit;
        font: inherit;
        place-items: center;
        cursor: pointer;
      }

      .pin:focus-visible {
        outline: none;
      }

      .pin:focus-visible .dot,
      .pin[aria-expanded="true"] .dot {
        box-shadow: 0 0 0 2px var(--yvz-surface), 0 0 0 4px var(--yvz-text);
      }

      .dot {
        position: relative;
        z-index: 1;
        display: grid;
        width: 22px;
        height: 22px;
        border: 1px solid var(--yvz-text-muted);
        border-radius: 50%;
        background: var(--yvz-surface-raised);
        color: var(--yvz-text);
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        place-items: center;
      }

      .pin[data-c="0"] .dot { background: var(--yvz-on); border-color: var(--yvz-on); color: #101418; }
      .pin[data-c="1"] .dot { background: var(--yvz-standby); border-color: var(--yvz-standby); color: #101418; }
      .pin[data-c="2"] .dot { background: var(--yvz-pending); border-color: var(--yvz-pending); color: #101418; }
      .pin[data-c="3"] .dot { background: var(--yvz-heat); border-color: var(--yvz-heat); color: #101418; }

      .badge {
        position: absolute;
        top: -7px;
        inset-inline-end: -9px;
        min-width: 14px;
        padding: 0 3px;
        border-radius: 8px;
        background: var(--yvz-text);
        color: var(--yvz-surface);
        font-size: 10px;
        line-height: 14px;
        text-align: center;
      }

      .stem {
        position: absolute;
        bottom: 50%;
        width: 0;
        height: var(--_stem);
        border-inline-start: 1px solid var(--yvz-text-muted);
        opacity: 0.45;
        pointer-events: none;
      }

      .pop {
        position: absolute;
        bottom: calc(100% + 8px);
        z-index: 3;
        box-sizing: border-box;
        width: 224px;
        padding: var(--yvz-space-2) var(--yvz-space-3);
        border: 1px solid var(--yvz-divider);
        border-radius: var(--yvz-radius-md);
        background: var(--yvz-surface-raised);
        box-shadow: 0 2px 10px rgb(0 0 0 / 0.3);
        color: var(--yvz-text);
        font-size: var(--yvz-text-label);
        line-height: var(--yvz-line-label);
      }

      .pop b {
        display: block;
        font-size: var(--yvz-text-body);
        font-weight: var(--yvz-weight-medium);
        line-height: var(--yvz-line-body);
      }

      .pop .when {
        color: var(--yvz-text-muted);
      }

      .pop ul {
        max-height: 150px;
        margin: var(--yvz-space-1) 0 0;
        padding: 0;
        overflow: auto;
        list-style: none;
      }

      .pop li {
        padding: 2px 0;
      }

      .pop li span {
        color: var(--yvz-text-muted);
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

  override connectedCallback(): void {
    super.connectedCallback();
    this.observer = new ResizeObserver(() => (this.width = Math.round(this.clientWidth)));
    this.observer.observe(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.observer?.disconnect();
    document.removeEventListener("pointerdown", this.onOutside, true);
  }

  protected override updated(changed: Map<string, unknown>): void {
    if (!changed.has("openKey")) return;
    document.removeEventListener("pointerdown", this.onOutside, true);
    if (this.openKey) document.addEventListener("pointerdown", this.onOutside, true);
  }

  // A press anywhere but on the pins and their popover closes it.
  private onOutside = (e: PointerEvent): void => {
    if (!e.composedPath().includes(this)) this.openKey = undefined;
  };

  private onKey(e: KeyboardEvent): void {
    if (e.key !== "Escape" || !this.openKey) return;
    e.stopPropagation();
    const key = this.openKey;
    this.openKey = undefined;
    // Back to the pin that opened it, so keyboard users don't lose their place.
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus());
  }

  private clusterLabel(c: PinCluster): string {
    if (c.pins.length > 1) return this.clusterText(c.pins.length, c.until);
    const p = c.pins[0];
    return `${p.text}, ${p.who}, ${p.when}`;
  }

  private renderLane(clusters: PinCluster[], stem: number) {
    const open = clusters.find((c) => c.pins[0].id === this.openKey);
    const left = open ? Math.min(Math.max(open.at * this.width - 112, 4), Math.max(4, this.width - 228)) : 0;
    return html`<div class="lane" role="group" aria-label=${this.pinsLabel || nothing} style="--_stem: ${stem}px" @keydown=${this.onKey}>
      ${clusters.map((c) => {
        const key = c.pins[0].id;
        const several = c.pins.length > 1;
        return html`<button
          type="button"
          class="pin"
          data-key=${key}
          data-c=${c.color === NEUTRAL ? "n" : c.color}
          style="left: ${c.at * 100}%"
          aria-label=${this.clusterLabel(c)}
          aria-haspopup="dialog"
          aria-expanded=${this.openKey === key}
          aria-controls=${this.openKey === key ? "pop" : nothing}
          @click=${() => (this.openKey = this.openKey === key ? undefined : key)}
        >
          <i class="stem"></i><span class="dot">${c.initial || (several ? c.pins.length : "")}${several && c.initial ? html`<i class="badge">${c.pins.length}</i>` : nothing}</span>
        </button>`;
      })}
      ${open
        ? html`<div class="pop" id="pop" role="dialog" aria-label=${this.clusterLabel(open)} style="left: ${left}px">
            ${open.pins.length > 1
              ? html`<b>${this.clusterText(open.pins.length, open.until)}</b
                  ><ul>
                    ${open.pins.map((p) => html`<li>${p.text} <span>· ${p.who} · ${p.when}</span></li>`)}
                  </ul>`
              : html`<b>${open.pins[0].text} · ${open.pins[0].who}</b><span class="when">${open.pins[0].when}</span>`}
          </div>`
        : nothing}
    </div>`;
  }

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

  // On the longer views the start says which day it is: the weekday alone repeats at the end.
  private startLabel(): string {
    if (this.to - this.from <= 36 * 3_600_000) return this.time(this.from);
    return new Intl.DateTimeFormat(this.locale || undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(this.from);
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
    const clusters = this.pins.length && this.width > 0 ? clusterPins(this.pins, this.from, this.to, this.width) : [];
    // The lane takes its share of the height, so the whole box stays the size the card gave it.
    const H = this.height - (this.pins.length ? LANE_H : 0);
    const plot = H - stripH - gap;
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
    // The outdoor line has a scale of its own: it lives far from the room temperature and would be off the chart.
    const outside = this.outdoor.map((p) => p.v);
    let oLo = outside.length ? Math.floor(Math.min(...outside)) : 0;
    let oHi = outside.length ? Math.ceil(Math.max(...outside)) : 1;
    if (oHi - oLo < 2) {
      oLo -= 1;
      oHi += 1;
    }
    const yOut = (v: number) => 2 + (1 - (v - oLo) / (oHi - oLo || 1)) * (plot - 4);
    const line = (pts: TimelinePoint[], stepped = false, scale: (v: number) => number = y): string =>
      pts
        .map((p, i) => {
          const px = x(p.t).toFixed(2);
          const prev = pts[i - 1];
          if (!i) return `M${px},${scale(p.v).toFixed(2)}`;
          return stepped ? `L${px},${scale(prev.v).toFixed(2)} L${px},${scale(p.v).toFixed(2)}` : `L${px},${scale(p.v).toFixed(2)}`;
        })
        .join(" ") + (stepped && pts.length ? ` L100,${scale(pts[pts.length - 1].v).toFixed(2)}` : "");
    const at = this.hover == null || this.openKey ? undefined : this.from + this.hover * span;
    const running = at == null ? false : this.runs.some(([a, b]) => at >= a && at <= b);
    const temp = at == null ? undefined : this.valueAt(this.temperature, at);
    const set = at == null ? undefined : this.valueAt(this.setpoint, at);
    const out = at == null ? undefined : this.valueAt(this.outdoor, at);
    return html`
      <svg
        viewBox="0 0 100 ${H}"
        preserveAspectRatio="none"
        style="height: ${H}px"
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
        ${this.outdoor.length ? svg`<path class="out" d=${line(this.outdoor, false, yOut)}></path>` : nothing}
        ${this.temperature.length ? svg`<path class="temp" d=${line(this.temperature)}></path>` : nothing}
        <rect class="strip" x="0" y=${plot + gap} width="100" height=${stripH} rx="1.5"></rect>
        ${this.runs.map(
          ([a, b]) => svg`<rect class="run" x=${x(a)} y=${plot + gap} width=${Math.max(0.25, x(b) - x(a))} height=${stripH}></rect>`,
        )}
      </svg>
      ${this.pins.length ? this.renderLane(clusters, H - 2) : nothing}
      ${all.length
        ? html`<div class="scale" style="height: ${plot}px"><span>${this.fmt(hi)}</span><span>${this.fmt(lo)}</span></div>`
        : nothing}
      ${this.outdoor.length
        ? html`<div class="scale right" style="height: ${plot}px" aria-hidden="true"><span>${this.fmt(oHi)}</span><span>${this.fmt(oLo)}</span></div>`
        : nothing}
      <div class="axis" aria-hidden="true">
        <span>${this.startLabel()}</span><span>${this.time(this.to)}</span>
      </div>
      ${at == null
        ? nothing
        : html`<i class="guide" style="left: ${this.hover! * 100}%; height: ${H}px"></i>
            <div class="tip" style="left: ${Math.min(Math.max(this.hover! * 100, 18), 82)}%; transform: translateX(-50%)">
              <time>${this.time(at)}</time>${[
                temp == null ? "" : this.fmt(temp),
                set == null ? "" : `→ ${this.fmt(set)}`,
                out == null ? "" : `${this.outdoorLabel} ${this.fmt(out)}`.trim(),
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
