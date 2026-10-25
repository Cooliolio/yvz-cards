import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { designStyles } from "../styles";
import type { HomeAssistant } from "../../shared/types";

type HistoryItem = { s?: string; state?: string };

const REFRESH_MS = 5 * 60_000;
const MAX_POINTS = 60;

function downsample(values: number[]): number[] {
  if (values.length <= MAX_POINTS) return values;
  const size = values.length / MAX_POINTS;
  return Array.from({ length: MAX_POINTS }, (_, i) => {
    const bucket = values.slice(Math.floor(i * size), Math.floor((i + 1) * size) || undefined);
    return bucket.reduce((a, b) => a + b, 0) / bucket.length;
  });
}

// Fetches its own history; stroke follows --yvz-state when a parent sets one.
@customElement("yvz-sparkline")
export class YvzSparkline extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property() entity = "";
  @property({ type: Number }) hours = 24;
  @property({ type: Number }) height = 28;
  @state() private points: number[] = [];

  private fetchedAt = 0;
  private fetching = false;

  static override styles = [
    designStyles,
    css`
      :host {
        display: block;
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

      .stroke {
        fill: none;
        stroke: var(--yvz-state, var(--yvz-text-muted));
        stroke-width: 1.5;
        stroke-linecap: round;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
      }

      stop {
        stop-color: var(--yvz-state, var(--yvz-text-muted));
      }
    `,
  ];

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (!this.hass || !this.entity) return;
    const stale = Date.now() - this.fetchedAt > REFRESH_MS;
    if (changed.has("entity") || changed.has("hours") || (stale && !this.fetching)) void this.load();
  }

  private async load(): Promise<void> {
    if (!this.hass) return;
    this.fetching = true;
    this.fetchedAt = Date.now();
    try {
      const end = new Date();
      const start = new Date(end.getTime() - this.hours * 3_600_000);
      const result = await this.hass.callWS<Record<string, HistoryItem[]>>({
        type: "history/history_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        entity_ids: [this.entity],
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      const values = (result[this.entity] ?? [])
        .map((item) => parseFloat(item.s ?? item.state ?? ""))
        .filter((n) => !Number.isNaN(n));
      this.points = downsample(values);
    } catch {
      this.points = [];
    } finally {
      this.fetching = false;
    }
  }

  protected override render() {
    if (this.points.length < 2) return html`<div style="height: ${this.height}px"></div>`;
    const min = Math.min(...this.points);
    const max = Math.max(...this.points);
    const span = max - min || 1;
    const h = this.height;
    const coords = this.points.map((v, i) => {
      const x = (i / (this.points.length - 1)) * 100;
      const y = 2 + (1 - (v - min) / span) * (h - 4);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const line = `M${coords.join(" L")}`;
    return html`
      <svg viewBox="0 0 100 ${h}" preserveAspectRatio="none" style="height: ${h}px" aria-hidden="true">
        <defs>
          <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-opacity="0.18"></stop>
            <stop offset="1" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        <path class="area" d="${line} L100,${h} L0,${h} Z"></path>
        <path class="stroke" d=${line}></path>
      </svg>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-sparkline": YvzSparkline;
  }
}
