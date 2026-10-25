import { css, html, LitElement, nothing, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { designStyles } from "../styles";
import type { HomeAssistant } from "../../shared/types";

type HistoryItem = { s?: string; state?: string; lu?: number; last_updated?: string };

export interface SparkSeries {
  entity: string;
  unit?: string;
  // Prefix in the tooltip, e.g. an arrow for download/upload.
  mark?: string;
}

const REFRESH_MS = 5 * 60_000;
const BUCKETS = 60;

// Averages state changes into fixed time buckets, carrying the last value through quiet ones.
function bucket(items: HistoryItem[], start: number, end: number): number[] {
  const samples = items
    .map((i) => ({
      t: i.lu != null ? i.lu * 1000 : Date.parse(i.last_updated ?? ""),
      v: parseFloat(i.s ?? i.state ?? ""),
    }))
    .filter((p) => !Number.isNaN(p.t) && !Number.isNaN(p.v));
  if (!samples.length) return [];
  const size = (end - start) / BUCKETS;
  const out: number[] = [];
  let j = 0;
  let last: number | undefined;
  for (let i = 0; i < BUCKETS; i++) {
    const until = start + (i + 1) * size;
    let sum = 0;
    let n = 0;
    for (; j < samples.length && samples[j].t < until; j++) {
      sum += samples[j].v;
      n++;
    }
    if (n) last = sum / n;
    out.push(last ?? NaN);
  }
  const first = out.find((v) => !Number.isNaN(v))!;
  return out.map((v) => (Number.isNaN(v) ? first : v));
}

// Fetches its own history; stroke follows --yvz-state when a parent sets one.
// With two series they mirror around a midline: the first above, the second below.
@customElement("yvz-sparkline")
export class YvzSparkline extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property() entity = "";
  @property() unit = "";
  @property({ attribute: false }) series?: SparkSeries[];
  @property({ type: Number }) hours = 24;
  @property({ type: Number }) height = 28;
  @property() locale = "";
  @state() private lines: number[][] = [];
  @state() private hover?: number;

  private start = 0;
  private end = 0;
  private loadedKey = "";
  private fetchedAt = 0;
  private fetching = false;

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

      .area {
        fill: url(#fade);
      }

      .area.down {
        fill: url(#fade-down);
      }

      .stroke {
        fill: none;
        stroke: var(--yvz-state, var(--yvz-text-muted));
        stroke-width: 1.5;
        stroke-linecap: round;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
      }

      .stroke.down {
        opacity: 0.6;
      }

      .mid {
        stroke: var(--yvz-divider);
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }

      stop {
        stop-color: var(--yvz-state, var(--yvz-text-muted));
      }

      .guide {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 1px;
        background: var(--yvz-divider);
        pointer-events: none;
      }

      .dot {
        position: absolute;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--yvz-state, var(--yvz-text-muted));
        transform: translate(-50%, -50%);
        pointer-events: none;
      }

      .tip {
        position: absolute;
        bottom: calc(100% + 4px);
        z-index: 1;
        padding: 2px 6px;
        border-radius: var(--yvz-radius-sm);
        background: var(--yvz-surface-raised);
        box-shadow: 0 1px 4px rgb(0 0 0 / 0.25);
        color: var(--yvz-text);
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

  private get list(): SparkSeries[] {
    return this.series ?? (this.entity ? [{ entity: this.entity, unit: this.unit }] : []);
  }

  protected override willUpdate(): void {
    const list = this.list;
    if (!this.hass || !list.length) return;
    const key = `${list.map((s) => s.entity).join(",")}|${this.hours}`;
    const stale = Date.now() - this.fetchedAt > REFRESH_MS;
    if (key !== this.loadedKey || (stale && !this.fetching)) void this.load(key, list);
  }

  private async load(key: string, list: SparkSeries[]): Promise<void> {
    if (!this.hass) return;
    this.loadedKey = key;
    this.fetching = true;
    this.fetchedAt = Date.now();
    try {
      const end = Date.now();
      const start = end - this.hours * 3_600_000;
      const result = await this.hass.callWS<Record<string, HistoryItem[]>>({
        type: "history/history_during_period",
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
        entity_ids: list.map((s) => s.entity),
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      this.start = start;
      this.end = end;
      this.lines = list.map((s) => bucket(result[s.entity] ?? [], start, end));
    } catch {
      this.lines = [];
    } finally {
      this.fetching = false;
    }
  }

  // y in px for every point of every line.
  private project(): number[][] {
    const h = this.height;
    if (this.lines.length < 2) {
      const line = this.lines[0];
      const min = Math.min(...line);
      const span = Math.max(...line) - min || 1;
      return [line.map((v) => 2 + (1 - (v - min) / span) * (h - 4))];
    }
    const mid = h / 2;
    return this.lines.slice(0, 2).map((line, i) => {
      const max = Math.max(...line) || 1;
      return line.map((v) => mid + (i === 0 ? -1 : 1) * (v / max) * (mid - 1));
    });
  }

  private onMove(e: PointerEvent): void {
    const rect = this.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    this.hover = Math.round(f * (BUCKETS - 1));
  }

  // Keeps the tooltip over the line but inside the sparkline, centring it when it's wider.
  protected override updated(): void {
    const tip = this.renderRoot.querySelector<HTMLElement>(".tip");
    if (!tip || this.hover == null) return;
    const width = this.clientWidth;
    const tipWidth = tip.offsetWidth;
    const x = (this.hover / (BUCKETS - 1)) * width;
    const left = tipWidth >= width ? (width - tipWidth) / 2 : Math.min(Math.max(0, x - tipWidth / 2), width - tipWidth);
    tip.style.left = `${left}px`;
  }

  private format(value: number, unit?: string): string {
    const n = value.toLocaleString(this.locale || undefined, { maximumFractionDigits: Math.abs(value) < 10 ? 1 : 0 });
    return unit ? `${n} ${unit}` : n;
  }

  private renderTip(ys: number[][]) {
    const i = this.hover!;
    const x = (i / (BUCKETS - 1)) * 100;
    const at = this.start + ((i + 0.5) / BUCKETS) * (this.end - this.start);
    const time = new Intl.DateTimeFormat(this.locale || undefined, {
      ...(this.hours > 24 ? { weekday: "short" } : {}),
      hour: "2-digit",
      minute: "2-digit",
    }).format(at);
    const list = this.list;
    return html`
      <i class="guide" style="left: ${x}%"></i>
      ${ys.map((line, s) => html`<i class="dot" style="left: ${x}%; top: ${line[i]}px; opacity: ${s ? 0.6 : 1}"></i>`)}
      <div class="tip">
        <time>${time}</time>${this.lines
          .slice(0, ys.length)
          .map((line, s) => `${s ? " · " : ""}${list[s]?.mark ?? ""}${this.format(line[i], list[s]?.unit)}`)
          .join("")}
      </div>
    `;
  }

  protected override render() {
    const h = this.height;
    if (!this.lines.length || this.lines.some((l) => l.length < 2)) return html`<div style="height: ${h}px"></div>`;
    const ys = this.project();
    const paths = ys.map((line) => `M${line.map((y, i) => `${((i / (line.length - 1)) * 100).toFixed(2)},${y.toFixed(2)}`).join(" L")}`);
    const base = ys.length > 1 ? h / 2 : h;
    return html`
      <svg
        viewBox="0 0 100 ${h}"
        preserveAspectRatio="none"
        style="height: ${h}px"
        aria-hidden="true"
        @pointermove=${this.onMove}
        @pointerleave=${() => (this.hover = undefined)}
      >
        <defs>
          <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-opacity="0.18"></stop>
            <stop offset="1" stop-opacity="0"></stop>
          </linearGradient>
          <linearGradient id="fade-down" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stop-opacity="0.12"></stop>
            <stop offset="1" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        ${ys.length > 1 ? svg`<line class="mid" x1="0" y1=${base} x2="100" y2=${base}></line>` : nothing}
        ${paths.map(
          (d, i) => svg`
            <path class="area ${i ? "down" : ""}" d="${d} L100,${base} L0,${base} Z"></path>
            <path class="stroke ${i ? "down" : ""}" d=${d}></path>
          `,
        )}
      </svg>
      ${this.hover == null ? nothing : this.renderTip(ys)}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-sparkline": YvzSparkline;
  }
}
