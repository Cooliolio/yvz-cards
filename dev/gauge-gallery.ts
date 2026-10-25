import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { formatDuration } from "../src/shared/format";
import { createTranslator } from "../src/shared/i18n";
import type { HomeAssistant } from "../src/shared/types";

interface Item {
  entity: string;
  label: string;
  unit?: string;
  min?: number;
  max?: number;
  warnAt?: number;
  errorAt?: number;
  invert?: boolean;
}

const temp = (entity: string, label: string, warnAt: number, errorAt: number): Item => ({
  entity,
  label,
  unit: "°C",
  min: 20,
  max: 100,
  warnAt,
  errorAt,
});

const USAGE: Item[] = [
  { entity: "cpu", label: "CPU", warnAt: 70, errorAt: 90 },
  { entity: "ram", label: "RAM", warnAt: 75, errorAt: 90 },
  { entity: "jellyfin", label: "Jellyfin", warnAt: 70, errorAt: 90 },
  { entity: "frigate", label: "Frigate", warnAt: 70, errorAt: 90 },
  temp("temp", "CPU temp", 70, 85),
  temp("nvme", "NVMe temp", 60, 75),
  temp("chipset", "Chipset temp", 70, 85),
  temp("case", "Case temp", 50, 60),
];

const CAPACITY: Item[] = [
  { entity: "disk", label: "Disk", warnAt: 80, errorAt: 95 },
  { entity: "lvm", label: "local-lvm", warnAt: 80, errorAt: 95 },
  { entity: "rec", label: "Recordings", warnAt: 80, errorAt: 95 },
  { entity: "battery", label: "Battery", warnAt: 40, errorAt: 15, invert: true },
];

// Dev-only: shows every gauge kind inside seamless cards.
@customElement("yvz-gauge-gallery")
export class YvzGaugeGallery extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;

  setConfig(): void {}

  static override styles = css`
    :host {
      display: block;
    }

    h4 {
      margin: 20px 0 8px;
      color: var(--secondary-text-color);
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    h4:first-child {
      margin-top: 0;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1px;
      background: var(--divider-color);
    }

    .cell {
      padding: 14px 16px;
      background: var(--card-background-color);
    }

    .cell.wide {
      grid-column: span 2;
    }

    .cell.stacked {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
  `;

  private num(key: string): number | undefined {
    const n = parseFloat(this.hass?.states[`sensor.demo_${key}`]?.state ?? "");
    return Number.isNaN(n) ? undefined : n;
  }

  private gauge(item: Item, variant: "line" | "segments"): TemplateResult {
    return html`<yvz-gauge
      .variant=${variant}
      .label=${item.label}
      .unit=${item.unit ?? "%"}
      .value=${this.num(item.entity)}
      .min=${item.min ?? 0}
      .max=${item.max ?? 100}
      .warnAt=${item.warnAt}
      .errorAt=${item.errorAt}
      .invert=${item.invert ?? false}
    ></yvz-gauge>`;
  }

  private section(title: string, cells: Array<TemplateResult | [TemplateResult, string]>): TemplateResult {
    return html`
      <h4>${title}</h4>
      <ha-card>
        <div class="grid">
          ${cells.map((c) => {
            const [content, cls] = Array.isArray(c) ? c : [c, ""];
            return html`<div class="cell ${cls}">${content}</div>`;
          })}
        </div>
      </ha-card>
    `;
  }

  protected override render() {
    const hass = this.hass;
    if (!hass) return nothing;
    const t = createTranslator(hass);
    const n = (k: string) => this.num(k);
    const hours = (k: string) => (n(k) ?? 0) * 3_600_000;
    const minutes = (k: string) => (n(k) ?? 0) * 60_000;

    return html`
      ${this.section("usage and temperature · line", USAGE.map((i) => this.gauge(i, "line")))}
      ${this.section("capacity · segments", CAPACITY.map((i) => this.gauge(i, "segments")))}
      ${this.section("stat", [
        html`<yvz-gauge variant="stat" label="Jellyfin viewers" unit="" .value=${n("viewers")}></yvz-gauge>`,
        html`<yvz-gauge variant="stat" label="Detector" unit="ms" .value=${n("detector")} .warnAt=${60} .errorAt=${100}></yvz-gauge>`,
        html`<yvz-gauge variant="stat" label="Uptime" display="12 d 4 h"></yvz-gauge>`,
        html`<yvz-gauge variant="stat" label="Camera fps" unit="fps" .value=${n("fps")} .warnAt=${10} .errorAt=${5} invert></yvz-gauge>`,
      ])}
      ${this.section("rate · single and paired", [
        [
          html`<yvz-rate
            label="Network"
            .series=${[
              { value: n("rx"), unit: "MB/s", icon: "mdi:arrow-down" },
              { value: n("tx"), unit: "MB/s", icon: "mdi:arrow-up" },
            ]}
          ></yvz-rate>`,
          "",
        ],
        [
          html`<yvz-rate
            label="NVMe"
            .series=${[
              { value: n("read"), unit: "MB/s", icon: "mdi:arrow-down" },
              { value: n("write"), unit: "MB/s", icon: "mdi:arrow-up" },
            ]}
          ></yvz-rate>`,
          "",
        ],
        [
          html`<yvz-rate label="Jellyfin stream" .series=${[{ value: n("rx"), unit: "MB/s" }]}></yvz-rate>`,
          "wide",
        ],
      ])}
      ${this.section("age and countdown", [
        html`<yvz-gauge
          label="Last backup"
          .value=${(n("backupAge") ?? 0) * 3600}
          .max=${86400}
          .warnAt=${64800}
          .errorAt=${86400}
          .display=${formatDuration(t, hours("backupAge"))}
        ></yvz-gauge>`,
        html`<yvz-gauge
          label="Heating boost"
          .value=${(n("boost") ?? 0) * 60}
          .max=${900}
          .warnAt=${225}
          .errorAt=${90}
          invert
          .display=${formatDuration(t, minutes("boost"))}
        ></yvz-gauge>`,
      ])}
      ${this.section("setpoint", [
        html`<yvz-gauge
          label="Living room"
          unit="°C"
          .decimals=${1}
          .min=${10}
          .max=${30}
          .value=${n("heat")}
          .target=${n("heatTarget")}
        ></yvz-gauge>`,
        html`<yvz-gauge
          label="Pellet tank"
          unit="kg"
          .max=${26}
          .value=${n("tank")}
          .warnAt=${6}
          .errorAt=${3}
          .target=${6}
          invert
        ></yvz-gauge>`,
      ])}
      ${this.section("stacked", [
        [
          html`<yvz-stack
            label="Storage"
            unit="GB"
            .total=${1000}
            .parts=${[
              { label: "System", value: n("sys") ?? 0 },
              { label: "Recordings", value: n("recgb") ?? 0 },
              { label: "Media", value: n("media") ?? 0 },
            ]}
          ></yvz-stack>`,
          "wide",
        ],
      ])}
      ${this.section("trend", [
        [
          html`<yvz-gauge variant="stat" label="CPU" .value=${n("cpu")} .warnAt=${70} .errorAt=${90}></yvz-gauge>
            <yvz-sparkline .hass=${hass} entity="sensor.demo_cpu"></yvz-sparkline>`,
          "stacked",
        ],
        [
          html`<yvz-gauge variant="stat" label="CPU temp" unit="°C" .value=${n("temp")} .warnAt=${70} .errorAt=${85}></yvz-gauge>
            <yvz-sparkline .hass=${hass} entity="sensor.demo_temp"></yvz-sparkline>`,
          "stacked",
        ],
      ])}
    `;
  }
}
