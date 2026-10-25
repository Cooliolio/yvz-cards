import { css, html, nothing, type CSSResultGroup, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import "../../design";
import type { RateSeries, YvzState } from "../../design";
import { formatDuration, formatDurationShort } from "../../shared/format";
import { fireMoreInfo } from "../../shared/more-info";
import { registerCard } from "../../shared/register-card";
import { TickController } from "../../shared/tick-controller";
import type { HassEntity, LovelaceCardConfig } from "../../shared/types";
import { YvzCard } from "../../shared/yvz-card";
import "./yvz-host-card-editor";
import type { HostCardConfig, HostGuest } from "./types";

const UNAVAILABLE = ["unavailable", "unknown"];
const USAGE = { warn: 70, error: 90 };
const DISK = { warn: 80, error: 95 };
const TEMP_C = { min: 20, max: 100, warn: 70, error: 85 };

function guestEntities(g: HostGuest) {
  const p = g.prefix;
  return {
    status: g.status ?? (p ? `binary_sensor.${p}_status` : undefined),
    cpu: g.cpu ?? (p ? `sensor.${p}_cpu_usage` : undefined),
    memory: g.memory ?? (p ? `sensor.${p}_memory_usage_percentage` : undefined),
    disk: g.disk ?? (p ? `sensor.${p}_disk_usage` : undefined),
    uptime: g.uptime ?? (p ? `sensor.${p}_uptime` : undefined),
  };
}

function toneOf(value: number | undefined, limits: { warn: number; error: number }): string {
  if (value == null) return "";
  if (value >= limits.error) return "error";
  if (value >= limits.warn) return "pending";
  return "";
}

@customElement("yvz-host-card")
export class YvzHostCard extends YvzCard<HostCardConfig> {
  constructor() {
    super();
    new TickController(this, 60_000);
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("yvz-host-card-editor");
  }

  static getStubConfig(): Partial<HostCardConfig> {
    return {};
  }

  setConfig(config: LovelaceCardConfig): void {
    if (!config || typeof config !== "object") throw new Error("yvz-host-card: invalid configuration");
    this.config = config as HostCardConfig;
  }

  override getCardSize(): number {
    return 6;
  }

  private entity(id?: string): HassEntity | undefined {
    const e = id ? this.hass?.states[id] : undefined;
    return e && !UNAVAILABLE.includes(e.state) ? e : undefined;
  }

  private number(id?: string): number | undefined {
    const n = parseFloat(this.entity(id)?.state ?? "");
    return Number.isNaN(n) ? undefined : n;
  }

  private unit(id: string | undefined, fallback = ""): string {
    return String(this.hass?.states[id ?? ""]?.attributes.unit_of_measurement ?? fallback);
  }

  private label(id: string | undefined, name?: string): string {
    return name ?? String(this.hass?.states[id ?? ""]?.attributes.friendly_name ?? id ?? "");
  }

  private since(id?: string): number | undefined {
    const ts = Date.parse(this.entity(id)?.state ?? "");
    return Number.isNaN(ts) ? undefined : Date.now() - ts;
  }

  private cell(entity: string | undefined, content: TemplateResult): TemplateResult {
    const open = () => fireMoreInfo(this, entity);
    return html`<div
      class="cell"
      role=${entity ? "button" : nothing}
      tabindex=${entity ? 0 : nothing}
      @click=${open}
      @keydown=${(e: KeyboardEvent) => e.key === "Enter" && open()}
    >
      ${content}
    </div>`;
  }

  private gauge(
    entity: string | undefined,
    label: string,
    limits: { warn?: number; error?: number },
    variant: "line" | "segments" = "line",
    range: { min?: number; max?: number } = {},
  ): TemplateResult {
    const gauge = html`<yvz-gauge
      .variant=${variant}
      .label=${label}
      .unit=${this.unit(entity, "%")}
      .value=${this.number(entity)}
      .min=${range.min ?? 0}
      .max=${range.max ?? 100}
      .warnAt=${limits.warn}
      .errorAt=${limits.error}
      .locale=${this.hass?.locale?.language ?? ""}
    ></yvz-gauge>`;
    if (!this.config?.trend || !entity || variant === "segments") return this.cell(entity, gauge);
    return this.cell(
      entity,
      html`${gauge}<yvz-sparkline class="trend" .hass=${this.hass} .entity=${entity} .height=${22}></yvz-sparkline>`,
    );
  }

  private rates(label: string, a?: string, b?: string, aIcon = "mdi:arrow-down", bIcon = "mdi:arrow-up") {
    if (!a && !b) return nothing;
    const series: RateSeries[] = [a, b]
      .map((id, i) => ({ id, icon: i === 0 ? aIcon : bIcon }))
      .filter((s): s is { id: string; icon: string } => !!s.id)
      .map((s) => ({ value: this.number(s.id), unit: this.unit(s.id), icon: s.icon }));
    return this.cell(
      a ?? b,
      html`<yvz-rate .label=${label} .series=${series} .locale=${this.hass?.locale?.language ?? ""}></yvz-rate>`,
    );
  }

  private section(caption: string, cells: unknown[]): TemplateResult | typeof nothing {
    const real = cells.filter((c) => c !== nothing);
    if (!real.length) return nothing;
    return html`<section>
      ${caption ? html`<div class="caption">${caption}</div>` : nothing}
      <div class="grid">${real}</div>
    </section>`;
  }

  private renderGuest(g: HostGuest): TemplateResult | typeof nothing {
    const e = guestEntities(g);
    if (!e.status && !e.cpu && !e.memory && !e.disk && !e.uptime) return nothing;
    const t = this.t;
    const status = this.hass?.states[e.status ?? ""];
    const role: YvzState = !e.status ? "unavailable" : !status || UNAVAILABLE.includes(status.state) ? "unavailable" : status.state === "on" ? "on" : "error";
    const cpu = this.number(e.cpu);
    const mem = this.number(e.memory);
    const disk = this.number(e.disk);
    const diskUnit = this.unit(e.disk);
    const up = this.since(e.uptime);
    const pct = (v: number | undefined) => (v == null ? "—" : `${Math.round(v)}%`);
    const diskText =
      disk == null
        ? "—"
        : diskUnit === "%"
          ? `${Math.round(disk)}%`
          : `${disk.toLocaleString(this.hass?.locale?.language, { maximumFractionDigits: disk < 10 ? 1 : 0 })} ${diskUnit}`;
    const name = g.name ?? g.prefix ?? this.label(e.status).replace(/ status$/i, "");
    return html`<button class="row" @click=${() => fireMoreInfo(this, e.status ?? e.cpu)}>
      <span class="dot" data-state=${role}></span>
      <span class="name">${name}</span>
      <span class="num ${toneOf(cpu, USAGE)}">${pct(cpu)}</span>
      <span class="num ${toneOf(mem, USAGE)}">${pct(mem)}</span>
      <span class="num ${diskUnit === "%" ? toneOf(disk, DISK) : ""}">${diskText}</span>
      <span class="num up">${up == null ? "—" : formatDurationShort(t, up)}</span>
    </button>`;
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    const c = this.config;
    const t = this.t;
    const status = c.status ? this.hass.states[c.status] : undefined;
    const role: YvzState = !c.status
      ? "accent"
      : !status || UNAVAILABLE.includes(status.state)
        ? "unavailable"
        : status.state === "on"
          ? "on"
          : "error";
    const subtitle = !c.status
      ? ""
      : role === "on"
        ? t("host.online")
        : role === "error"
          ? t("host.offline")
          : t("common.unavailable");
    const uptime = role === "on" ? this.since(c.uptime) : undefined;
    const headTemp = this.number(c.temperature);

    const usage = [
      c.cpu ? this.gauge(c.cpu, t("host.cpu"), USAGE) : nothing,
      c.memory ? this.gauge(c.memory, t("host.memory"), USAGE) : nothing,
    ];
    const temps = (c.temperatures ?? [])
      .filter((s) => s.entity)
      .map((s) => {
        const f = this.unit(s.entity) === "°F";
        const k = f ? 1.8 : 1;
        const off = f ? 32 : 0;
        return this.gauge(
          s.entity,
          this.label(s.entity, s.name),
          { warn: s.warn_at ?? TEMP_C.warn * k + off, error: s.error_at ?? TEMP_C.error * k + off },
          "line",
          { min: TEMP_C.min * k + off, max: TEMP_C.max * k + off },
        );
      });
    const disks = (c.disks ?? [])
      .filter((s) => s.entity)
      .map((s) =>
        this.gauge(s.entity, this.label(s.entity, s.name), { warn: s.warn_at ?? DISK.warn, error: s.error_at ?? DISK.error }, "segments"),
      );
    const io = [
      this.rates(t("host.network"), c.network?.down, c.network?.up),
      this.rates(t("host.disk_io"), c.disk_io?.read, c.disk_io?.write),
    ];
    const guests = (c.guests ?? []).map((g) => this.renderGuest(g)).filter((g) => g !== nothing);

    return html`
      <ha-card data-state=${role}>
        <div class="head">
          <yvz-card-header icon="mdi:server" .heading=${c.name ?? t("host.default_name")} .subtitle=${subtitle}>
            ${uptime == null ? nothing : html`<yvz-chip slot="end" icon="mdi:clock-outline">${formatDuration(t, uptime)}</yvz-chip>`}
            ${headTemp == null
              ? nothing
              : html`<yvz-chip slot="end" icon="mdi:thermometer">${Math.round(headTemp)}°</yvz-chip>`}
          </yvz-card-header>
        </div>
        ${this.section("", usage)} ${this.section(t("host.section_temps"), temps)}
        ${this.section(t("host.section_storage"), disks)} ${this.section("", io)}
        ${guests.length
          ? html`<section>
              <div class="caption">${t("host.section_guests")}</div>
              <div class="cols">
                <span></span><span></span><span>${t("host.col_cpu")}</span><span>${t("host.col_ram")}</span
                ><span>${t("host.col_disk")}</span><span class="up">${t("host.col_up")}</span>
              </div>
              ${guests}
            </section>`
          : nothing}
      </ha-card>
    `;
  }

  static override styles: CSSResultGroup = [
    YvzCard.styles,
    css`
      ha-card {
        padding: 0;
        container-type: inline-size;
        overflow: hidden;
      }

      .head {
        padding: var(--yvz-space-4);
      }

      section {
        border-top: 1px solid var(--yvz-divider);
      }

      .caption {
        padding: var(--yvz-space-3) var(--yvz-space-4) var(--yvz-space-1);
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-caption);
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1px;
        background: var(--yvz-divider);
      }

      section:has(.caption) .grid {
        margin-top: var(--yvz-space-2);
      }

      .cell {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-2);
        padding: 14px var(--yvz-space-4);
        background: var(--yvz-surface);
      }

      .cell[role="button"] {
        cursor: pointer;
      }

      .cell:last-child:nth-child(odd) {
        grid-column: span 2;
      }

      .trend {
        --yvz-state: var(--yvz-text-muted);
      }

      @container (max-width: 339px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }

      .cols,
      .row {
        display: grid;
        grid-template-columns: 8px minmax(0, 1fr) 44px 44px 68px 44px;
        align-items: center;
        gap: 0 var(--yvz-space-3);
        width: 100%;
        padding: 0 var(--yvz-space-4);
      }

      .cols {
        padding-bottom: var(--yvz-space-1);
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-caption);
        line-height: var(--yvz-line-caption);
        text-align: end;
      }

      .row {
        min-height: 36px;
        border: 0;
        background: none;
        color: var(--yvz-text);
        font: inherit;
        text-align: start;
        cursor: pointer;
        transition: background var(--yvz-duration-fast) var(--yvz-ease);
      }

      .row:hover {
        background: var(--yvz-surface-raised);
      }

      .row:last-child {
        margin-bottom: var(--yvz-space-2);
      }

      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--yvz-state);
      }

      .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .num {
        font-variant-numeric: tabular-nums;
        text-align: end;
        white-space: nowrap;
      }

      .num.pending {
        color: var(--yvz-pending-text);
      }

      .num.error {
        color: var(--yvz-error-text);
      }

      .num.up {
        color: var(--yvz-text-muted);
      }

      @container (max-width: 439px) {
        .cols,
        .row {
          grid-template-columns: 8px minmax(0, 1fr) 40px 40px 64px;
        }

        .up {
          display: none;
        }
      }
    `,
  ];
}

registerCard({
  type: "yvz-host-card",
  name: "YVZ Host",
  description: "Server panel: usage, temperatures, storage, network and a list of services.",
});

declare global {
  interface HTMLElementTagNameMap {
    "yvz-host-card": YvzHostCard;
  }
}
