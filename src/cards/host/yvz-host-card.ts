import { css, html, nothing, type CSSResultGroup, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import "../../design";
import { gaugeState, type RateSeries, type SparkSeries, type YvzState } from "../../design";
import { formatDuration, formatDurationShort } from "../../shared/format";
import { fireMoreInfo } from "../../shared/more-info";
import { registerCard } from "../../shared/register-card";
import { TickController } from "../../shared/tick-controller";
import type { HassEntity, LovelaceCardConfig } from "../../shared/types";
import { YvzCard } from "../../shared/yvz-card";
import "./yvz-host-card-editor";
import type { GuestKind, HostCardConfig, HostGuest, HostSensor } from "./types";

const UNAVAILABLE = ["unavailable", "unknown"];
const USAGE = { warn: 70, error: 90 };
const DISK = { warn: 80, error: 95 };
const TEMP_C = { min: 20, max: 100, warn: 70, error: 85 };
// Narrowest a cell may get when a fixed column count is configured.
const MIN_CELL = 150;

const DEVICE_ICONS: Record<string, string> = {
  temperature: "mdi:thermometer",
  humidity: "mdi:water-percent",
  timestamp: "mdi:clock-outline",
  duration: "mdi:timer-outline",
  power: "mdi:flash",
  energy: "mdi:lightning-bolt",
  voltage: "mdi:sine-wave",
  current: "mdi:current-ac",
  frequency: "mdi:sine-wave",
  data_size: "mdi:harddisk",
  data_rate: "mdi:swap-vertical",
  running: "mdi:play-circle-outline",
  connectivity: "mdi:lan-connect",
  update: "mdi:package-up",
};
const UNIT_ICONS: Record<string, string> = { rpm: "mdi:fan", RPM: "mdi:fan" };
const KIND_ICONS: Record<GuestKind, string> = { vm: "mdi:monitor", container: "mdi:package-variant-closed" };

interface Section {
  caption: string;
  cells: TemplateResult[];
  trend?: boolean;
}

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

function autoColumns(width: number): number {
  if (width < 340) return 1;
  if (width < 600) return 2;
  if (width < 860) return 3;
  return 4;
}

// Fills rows left to right in order; a section that doesn't fit starts the next row.
function pack<T>(items: T[], span: (item: T) => number, cols: number): T[][] {
  const rows: T[][] = [];
  let used = cols;
  for (const item of items) {
    const s = Math.min(span(item), cols);
    if (used + s > cols) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push(item);
    used += s;
  }
  return rows;
}

const real = <T,>(items: (T | typeof nothing)[]): T[] => items.filter((i): i is T => i !== nothing);

@customElement("yvz-host-card")
export class YvzHostCard extends YvzCard<HostCardConfig> {
  @state() private cols = 2;
  private width = 0;
  private resize = new ResizeObserver(([entry]) => {
    this.width = entry.contentRect.width;
    this.updateColumns();
  });

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
    this.updateColumns();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.resize.observe(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resize.disconnect();
  }

  private updateColumns(): void {
    if (!this.width) return;
    const fixed = this.config?.columns;
    const fit = Math.max(1, Math.floor((this.width + 1) / (MIN_CELL + 1)));
    this.cols = fixed ? Math.max(1, Math.min(Math.round(fixed), fit)) : autoColumns(this.width);
  }

  // Rough height in 50px rows, from the config alone so it works before hass arrives.
  override getCardSize(): number {
    const c = this.config;
    if (!c) return 6;
    const compact = !!c.compact;
    const trend = this.trend ? 30 : 0;
    const cell = compact ? 44 : 56;
    const count = (...ids: (string | undefined)[]) => ids.filter(Boolean).length;
    const sections = [
      { n: compact ? 0 : count(c.cpu, c.memory), h: cell + trend },
      { n: (c.temperatures ?? []).length, h: cell + trend },
      { n: (c.disks ?? []).length, h: cell + 14 },
      { n: count(c.network?.down || c.network?.up, c.disk_io?.read || c.disk_io?.write), h: cell + (trend ? 36 : 10) },
      { n: (c.stats ?? []).length, h: compact ? 40 : 50 },
    ].filter((s) => s.n);
    let px = compact ? 58 : 66;
    for (const row of pack(sections, (s) => s.n, this.cols)) {
      px += Math.max(...row.map((s) => 30 + Math.ceil(s.n / Math.min(s.n, this.cols)) * s.h));
    }
    const guests = (c.guests ?? []).length;
    if (guests) px += 60 + Math.ceil(guests / (this.cols >= 4 ? 2 : 1)) * (compact ? 30 : 36);
    return Math.max(2, Math.ceil(px / 50));
  }

  private get trend(): boolean {
    return !!this.config?.trend && !this.config.compact;
  }

  private get hours(): number {
    return this.config?.trend_hours ?? 24;
  }

  private get locale(): string {
    return this.hass?.locale?.language ?? "";
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

  // Defaults are in °C; shifted when the sensor reports °F.
  private tempLimits(entity: string | undefined, s?: HostSensor) {
    const f = this.unit(entity) === "°F";
    const k = f ? 1.8 : 1;
    const off = f ? 32 : 0;
    return {
      warn: s?.warn_at ?? TEMP_C.warn * k + off,
      error: s?.error_at ?? TEMP_C.error * k + off,
      min: TEMP_C.min * k + off,
      max: TEMP_C.max * k + off,
    };
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

  private sparkline(height: number, entity?: string, series?: SparkSeries[], tone?: YvzState): TemplateResult {
    return html`<yvz-sparkline
      class="trend"
      data-state=${tone === "pending" || tone === "error" ? tone : nothing}
      .hass=${this.hass}
      .entity=${entity ?? ""}
      .unit=${this.unit(entity)}
      .series=${series}
      .hours=${this.hours}
      .height=${height}
      .locale=${this.locale}
    ></yvz-sparkline>`;
  }

  private gauge(
    entity: string | undefined,
    label: string,
    limits: { warn?: number; error?: number },
    variant: "line" | "segments" = "line",
    range: { min?: number; max?: number } = {},
  ): TemplateResult {
    const value = this.number(entity);
    const gauge = html`<yvz-gauge
      .variant=${variant}
      .label=${label}
      .unit=${this.unit(entity, "%")}
      .value=${value}
      .min=${range.min ?? 0}
      .max=${range.max ?? 100}
      .warnAt=${limits.warn}
      .errorAt=${limits.error}
      .locale=${this.locale}
    ></yvz-gauge>`;
    if (!this.trend || !entity || variant === "segments") return this.cell(entity, gauge);
    const tone = gaugeState({ value, warnAt: limits.warn, errorAt: limits.error });
    return this.cell(entity, html`${gauge}${this.sparkline(22, entity, undefined, tone)}`);
  }

  private rates(label: string, a?: string, b?: string): TemplateResult | typeof nothing {
    if (!a && !b) return nothing;
    const ids = [
      { id: a, icon: "mdi:arrow-down", mark: "↓ " },
      { id: b, icon: "mdi:arrow-up", mark: "↑ " },
    ].filter((s): s is { id: string; icon: string; mark: string } => !!s.id);
    const series: RateSeries[] = ids.map((s) => ({ value: this.number(s.id), unit: this.unit(s.id), icon: s.icon }));
    const trend: SparkSeries[] = ids.map((s) => ({ entity: s.id, unit: this.unit(s.id), mark: s.mark }));
    return this.cell(
      a ?? b,
      html`<yvz-rate .label=${label} .series=${series} .bars=${!this.trend} .locale=${this.locale}></yvz-rate>
        ${this.trend ? this.sparkline(trend.length > 1 ? 32 : 22, undefined, trend) : nothing}`,
    );
  }

  private statIcon(s: HostSensor): string {
    if (s.icon) return s.icon;
    const e = this.hass?.states[s.entity ?? ""];
    if (!e) return "";
    if (typeof e.attributes.icon === "string") return e.attributes.icon;
    const deviceClass = String(e.attributes.device_class ?? "");
    if (deviceClass === "problem") return e.state === "on" ? "mdi:alert-circle" : "mdi:check-circle";
    if (deviceClass === "battery") {
      const level = Math.round(parseFloat(e.state) / 10) * 10;
      if (!Number.isNaN(level)) return level >= 100 ? "mdi:battery" : level <= 0 ? "mdi:battery-outline" : `mdi:battery-${level}`;
    }
    return DEVICE_ICONS[deviceClass] ?? UNIT_ICONS[this.unit(s.entity)] ?? "";
  }

  private stat(s: HostSensor): TemplateResult | typeof nothing {
    if (!s.entity || !this.hass) return nothing;
    const t = this.t;
    const e = this.entity(s.entity);
    const base = { entity: s.entity, label: this.label(s.entity, s.name) };
    const deviceClass = e?.attributes.device_class;
    let display = "";
    let value: number | undefined;
    let tone: YvzState | undefined;
    if (e && deviceClass === "timestamp" && !Number.isNaN(Date.parse(e.state))) {
      display = t("host.ago", { time: formatDurationShort(t, Date.now() - Date.parse(e.state)) });
    } else if (e && deviceClass === "problem") {
      display = e.state === "on" ? t("host.problem") : t("host.ok");
      tone = e.state === "on" ? "error" : "on";
    } else if (e && s.entity.startsWith("binary_sensor.")) {
      display = this.hass.formatEntityState?.(e) ?? e.state;
    } else if (e) {
      value = parseFloat(e.state);
      if (Number.isNaN(value)) {
        value = undefined;
        display = this.hass.formatEntityState?.(e) ?? e.state;
      }
    }
    return this.cell(
      base.entity,
      html`<yvz-gauge
        variant="stat"
        .icon=${this.statIcon(s)}
        .label=${base.label}
        .unit=${this.unit(base.entity)}
        .value=${value}
        .display=${display}
        .tone=${tone}
        .decimals=${value != null && !Number.isInteger(value) && Math.abs(value) < 10 ? 1 : 0}
        .warnAt=${s.warn_at}
        .errorAt=${s.error_at}
        .locale=${this.locale}
      ></yvz-gauge>`,
    );
  }

  private get windowLabel(): string {
    const h = this.hours;
    return h >= 48 && h % 24 === 0 ? this.t("common.days_short", { count: h / 24 }) : this.t("common.hours_short", { count: h });
  }

  private renderSection(s: Section): TemplateResult {
    const span = Math.min(s.cells.length, this.cols);
    // A lone last cell in a two-column grid takes the whole row rather than leaving a hole.
    const fillLast = this.cols === 2 && span === 2 && s.cells.length % 2 === 1;
    return html`<section style="grid-column: span ${span}">
      <div class="caption">
        <span>${s.caption}</span>${s.trend && this.trend ? html`<span class="window">${this.windowLabel}</span>` : nothing}
      </div>
      <div class="grid ${fillLast ? "fill-last" : ""}" style="--cols: ${span}">${s.cells}</div>
    </section>`;
  }

  private meter(text: string, value: number | undefined, limits: { warn: number; error: number }): TemplateResult {
    return html`<span class="num ${toneOf(value, limits)}">
      <span>${text}</span>${value == null
        ? nothing
        : html`<i class="bar"><i style="width: ${Math.min(100, Math.max(0, value))}%"></i></i>`}
    </span>`;
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
    const name = g.name ?? g.prefix ?? this.label(e.status).replace(/ status$/i, "");
    const icon = g.icon ?? (g.kind ? KIND_ICONS[g.kind] : "");
    return html`<button class="row" @click=${() => fireMoreInfo(this, e.status ?? e.cpu)}>
      <span class="mark" data-state=${role}>
        ${icon ? html`<ha-icon .icon=${icon}></ha-icon>` : html`<span class="dot"></span>`}
      </span>
      <span class="name">${name}</span>
      ${this.meter(pct(cpu), cpu, USAGE)} ${this.meter(pct(mem), mem, USAGE)}
      ${diskUnit === "%"
        ? this.meter(pct(disk), disk, DISK)
        : html`<span class="num"
            >${disk == null
              ? "—"
              : `${disk.toLocaleString(this.locale || undefined, { maximumFractionDigits: disk < 10 ? 1 : 0 })} ${diskUnit}`}</span
          >`}
      <span class="num up">${up == null ? "—" : formatDurationShort(t, up)}</span>
    </button>`;
  }

  private renderGuests(): TemplateResult | typeof nothing {
    const t = this.t;
    const guests = real((this.config?.guests ?? []).map((g) => this.renderGuest(g)));
    if (!guests.length) return nothing;
    // Wide cards split the list in two so names and numbers stay close together.
    const half = Math.ceil(guests.length / 2);
    const lists = this.cols >= 4 && guests.length > 1 ? [guests.slice(0, half), guests.slice(half)] : [guests];
    return html`<section class="guests">
      <div class="caption"><span>${t("host.section_guests")}</span></div>
      <div class="guest-lists" style="--cols: ${lists.length}">
        ${lists.map(
          (list) => html`<div class="guest-list">
            <div class="cols">
              <span></span><span></span><span>${t("host.col_cpu")}</span><span>${t("host.col_ram")}</span
              ><span>${t("host.col_disk")}</span><span class="up">${t("host.col_up")}</span>
            </div>
            ${list}
          </div>`,
        )}
      </div>
    </section>`;
  }

  private chip(icon: string, text: string, entity?: string, tone?: string): TemplateResult {
    return html`<yvz-chip
      slot="end"
      class=${entity ? "clickable" : ""}
      icon=${icon}
      data-state=${tone || nothing}
      @click=${() => entity && fireMoreInfo(this, entity)}
      >${text}</yvz-chip
    >`;
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    const c = this.config;
    const t = this.t;
    const compact = !!c.compact;
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
    // The header chip would only repeat a sensor that already has its own cell.
    const headTemp = (c.temperatures ?? []).some((s) => s.entity === c.temperature) ? undefined : this.number(c.temperature);
    const cpu = this.number(c.cpu);
    const mem = this.number(c.memory);

    const usage = compact
      ? []
      : real([
          c.cpu ? this.gauge(c.cpu, t("host.cpu"), USAGE) : nothing,
          c.memory ? this.gauge(c.memory, t("host.memory"), USAGE) : nothing,
        ]);
    const temps = (c.temperatures ?? [])
      .filter((s) => s.entity)
      .map((s) => {
        const l = this.tempLimits(s.entity, s);
        return this.gauge(s.entity, this.label(s.entity, s.name), l, "line", l);
      });
    const disks = (c.disks ?? [])
      .filter((s) => s.entity)
      .map((s) =>
        this.gauge(s.entity, this.label(s.entity, s.name), { warn: s.warn_at ?? DISK.warn, error: s.error_at ?? DISK.error }, "segments"),
      );
    const io = real([
      this.rates(t("host.network"), c.network?.down, c.network?.up),
      this.rates(t("host.disk_io"), c.disk_io?.read, c.disk_io?.write),
    ]);
    const stats = real((c.stats ?? []).map((s) => this.stat(s)));
    const sections: Section[] = [
      { caption: t("host.section_usage"), cells: usage, trend: true },
      { caption: t("host.section_temps"), cells: temps, trend: true },
      { caption: t("host.section_storage"), cells: disks },
      { caption: t("host.section_io"), cells: io, trend: true },
      { caption: t("host.section_details"), cells: stats },
    ].filter((s) => s.cells.length);

    return html`
      <ha-card data-state=${role} class=${compact ? "compact" : ""}>
        <div class="head">
          <yvz-card-header
            icon="mdi:server"
            .heading=${c.name ?? t("host.default_name")}
            .subtitle=${compact && uptime != null ? `${subtitle} · ${formatDuration(t, uptime)}` : subtitle}
          >
            ${compact && cpu != null ? this.chip("mdi:cpu-64-bit", `${Math.round(cpu)}%`, c.cpu, toneOf(cpu, USAGE)) : nothing}
            ${compact && mem != null ? this.chip("mdi:memory", `${Math.round(mem)}%`, c.memory, toneOf(mem, USAGE)) : nothing}
            ${!compact && uptime != null ? this.chip("mdi:clock-outline", formatDuration(t, uptime)) : nothing}
            ${headTemp == null
              ? nothing
              : this.chip("mdi:thermometer", `${Math.round(headTemp)}°`, c.temperature, toneOf(headTemp, this.tempLimits(c.temperature)))}
          </yvz-card-header>
        </div>
        ${pack(sections, (s) => s.cells.length, this.cols).map(
          (row) => html`<div class="band" style="--cols: ${this.cols}">${row.map((s) => this.renderSection(s))}</div>`,
        )}
        ${this.renderGuests()}
      </ha-card>
    `;
  }

  static override styles: CSSResultGroup = [
    YvzCard.styles,
    css`
      ha-card {
        padding: 0;
        overflow: hidden;
      }

      .head {
        padding: var(--yvz-space-4);
      }

      yvz-chip.clickable {
        cursor: pointer;
      }

      /* A band is one row of sections; sections that share it are split by a vertical rule. */
      .band {
        display: grid;
        flex: 1 1 auto;
        align-content: center;
        grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
        column-gap: 1px;
        border-top: 1px solid var(--yvz-divider);
      }

      section {
        display: flex;
        flex-direction: column;
        min-width: 0;
        box-shadow: 1px 0 0 var(--yvz-divider);
      }

      section.guests {
        border-top: 1px solid var(--yvz-divider);
      }

      .caption {
        display: flex;
        justify-content: space-between;
        gap: var(--yvz-space-2);
        padding: var(--yvz-space-3) var(--yvz-space-4) var(--yvz-space-1);
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-caption);
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .caption span:first-child {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .window {
        flex: none;
        letter-spacing: normal;
        text-transform: none;
      }

      .grid {
        display: grid;
        flex: 1;
        grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
        gap: 1px;
        margin-top: var(--yvz-space-2);
      }

      .grid.fill-last > .cell:last-child {
        grid-column: span 2;
      }

      .cell {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-2);
        padding: 14px var(--yvz-space-4);
        background: var(--yvz-surface);
        /* Draws the right and bottom divider into the gap, so empty slots in a short last row stay blank. */
        box-shadow: 1px 1px 0 var(--yvz-divider);
        transition: background var(--yvz-duration-fast) var(--yvz-ease);
      }

      .cell[role="button"] {
        cursor: pointer;
      }

      .cell[role="button"]:hover {
        background: var(--yvz-surface-raised);
      }

      .cell:focus-visible {
        outline-offset: -2px;
      }

      .trend:not([data-state]) {
        --yvz-state: var(--yvz-text-muted);
      }

      .guest-lists {
        display: grid;
        grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
        column-gap: 1px;
      }

      .guest-list {
        container-type: inline-size;
        min-width: 0;
        box-shadow: 1px 0 0 var(--yvz-divider);
      }

      .cols,
      .row {
        display: grid;
        grid-template-columns: 16px minmax(0, 1fr) 44px 44px 68px 44px;
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

      .mark {
        display: flex;
        justify-content: center;
        color: var(--yvz-state);
      }

      .mark ha-icon {
        --mdc-icon-size: 16px;
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
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 3px;
        font-variant-numeric: tabular-nums;
        text-align: end;
        white-space: nowrap;
      }

      .bar {
        display: block;
        width: 100%;
        height: 2px;
        border-radius: 1px;
        background: var(--yvz-divider);
      }

      .bar i {
        display: block;
        height: 100%;
        border-radius: 1px;
        background: var(--yvz-text-muted);
        transition: width var(--yvz-duration-slow) var(--yvz-ease);
      }

      .num.pending {
        color: var(--yvz-pending-text);
      }

      .num.pending .bar i {
        background: var(--yvz-pending);
      }

      .num.error {
        color: var(--yvz-error-text);
      }

      .num.error .bar i {
        background: var(--yvz-error);
      }

      .num.up {
        color: var(--yvz-text-muted);
      }

      @container (max-width: 439px) {
        .cols,
        .row {
          grid-template-columns: 16px minmax(0, 1fr) 40px 40px 64px;
        }

        .up {
          display: none;
        }
      }

      /* compact: tighter spacing; usage lives in the header and trends are off */
      .compact .head {
        padding: var(--yvz-space-3);
      }

      .compact .caption {
        padding: var(--yvz-space-2) var(--yvz-space-3) 0;
      }

      .compact .grid {
        margin-top: var(--yvz-space-1);
      }

      .compact .cell {
        gap: 6px;
        padding: 10px var(--yvz-space-3);
      }

      .compact .cols,
      .compact .row {
        padding: 0 var(--yvz-space-3);
      }

      .compact .row {
        min-height: 30px;
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
