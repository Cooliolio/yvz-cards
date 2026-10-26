import { css, html, nothing, type CSSResultGroup, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import "../../design";
import type { SegmentOption, TileBadge, YvzState } from "../../design";
import { NumberTween } from "../../design/tween";
import { animateHeight, viewSwapStyles } from "../../design/view-swap";
import { runAction } from "../../shared/actions";
import { formatDuration, formatNumber } from "../../shared/format";
import { haptic } from "../../shared/haptic";
import { registerCard } from "../../shared/register-card";
import { TickController } from "../../shared/tick-controller";
import type { HassEntity, LovelaceCardConfig } from "../../shared/types";
import { YvzCard } from "../../shared/yvz-card";
import "./yvz-heating-card-editor";
import { HEATING_ENTITIES, type HeatingCardConfig, type HeatingEntityKey, type HeatingMode } from "./types";

const UNAVAILABLE = ["unavailable", "unknown"];
const DEBOUNCE_MS = 600;
// How long an optimistic value wins over HA's state after it was sent.
const HOLD_MS = 2500;
const TREND_THRESHOLD = 0.15;
const RESTORE_MODES: HeatingMode[] = ["Off", "On", "Eco", "Comfort"];

type SettingKey = "comfort" | "eco" | "boost_minutes" | "frost_temp";
type Preset = "Eco" | "Comfort" | "Boost";

interface Setting {
  key: SettingKey;
  label: string;
  fallback: { min: number; max: number; step: number };
  minutes?: boolean;
}

// "1:30:00" → ms; timers report their duration this way.
function parseDuration(text: unknown): number | undefined {
  const parts = String(text ?? "").split(":").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return undefined;
  return ((parts[0] * 60 + parts[1]) * 60 + parts[2]) * 1000;
}

@customElement("yvz-heating-card")
export class YvzHeatingCard extends YvzCard<HeatingCardConfig> {
  @state() private view: "main" | "settings" = "main";
  // Set after the first toggle, so the initial render doesn't slide in.
  @state() private switched = false;
  @state() private pendingTarget?: number;
  @state() private pending: Partial<Record<SettingKey, number>> = {};

  private targetTween = new NumberTween(this);
  private targetTimer?: ReturnType<typeof setTimeout>;
  private settingTimers: Partial<Record<SettingKey, ReturnType<typeof setTimeout>>> = {};

  constructor() {
    super();
    new TickController(this, 15_000);
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("yvz-heating-card-editor");
  }

  static getStubConfig(): Partial<HeatingCardConfig> {
    return {};
  }

  setConfig(config: LovelaceCardConfig): void {
    if (!config || typeof config !== "object") throw new Error("yvz-heating-card: invalid configuration");
    this.config = config as HeatingCardConfig;
  }

  override getCardSize(): number {
    return this.config?.compact ? 6 : 8;
  }

  private entityId(key: HeatingEntityKey): string {
    return this.config?.[key] ?? HEATING_ENTITIES[key];
  }

  private st(key: HeatingEntityKey): HassEntity | undefined {
    return this.hass?.states[this.entityId(key)];
  }

  private v(key: HeatingEntityKey): string | undefined {
    return this.st(key)?.state;
  }

  private num(key: HeatingEntityKey, fallback: number): number {
    const n = parseFloat(this.v(key) ?? "");
    return Number.isNaN(n) ? fallback : n;
  }

  private attr(key: HeatingEntityKey, name: string, fallback: number): number {
    const n = Number(this.st(key)?.attributes[name]);
    return Number.isFinite(n) ? n : fallback;
  }

  private get mode(): HeatingMode | undefined {
    return this.v("mode") as HeatingMode | undefined;
  }

  private temp(v: number): string {
    return `${formatNumber(this.hass!, v, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`;
  }

  // "21,5°" as ["21", ",5°"], so the decimals can be set smaller next to the whole degrees.
  private splitTemp(v: number): [string, string] {
    const hass = this.hass!;
    const parts = new Intl.NumberFormat(hass.locale?.language ?? hass.language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).formatToParts(v);
    const join = (list: Intl.NumberFormatPart[]) => list.map((p) => p.value).join("");
    const i = parts.findIndex((p) => p.type === "decimal");
    return i < 0 ? [join(parts), "°"] : [join(parts.slice(0, i)), `${join(parts.slice(i))}°`];
  }

  private call(domain: string, service: string, data: Record<string, unknown>): Promise<unknown> {
    return this.hass!.callService(domain, service, data);
  }

  private selectMode(mode: HeatingMode): Promise<unknown> {
    haptic("selection");
    return this.call("input_select", "select_option", { entity_id: this.entityId("mode"), option: mode });
  }

  private get setpoint(): number {
    if (this.pendingTarget != null) return this.pendingTarget;
    const t = Number(this.st("climate")?.attributes.temperature);
    return Number.isFinite(t) ? t : this.num("target", 19);
  }

  // Nudging always ends up in "On" with the nudged value as manual target.
  private nudge(direction: -1 | 1): void {
    if (this.mode === "Off") return;
    const step = this.attr("climate", "target_temp_step", 0.5);
    const min = this.attr("climate", "min_temp", 5);
    const max = this.attr("climate", "max_temp", 25);
    const value = Math.min(max, Math.max(min, Math.round((this.setpoint + direction * step) / step) * step));
    if (value === this.setpoint) return;
    haptic("light");
    this.pendingTarget = value;
    clearTimeout(this.targetTimer);
    this.targetTimer = setTimeout(async () => {
      await this.call("input_number", "set_value", { entity_id: this.entityId("target"), value });
      if (this.mode !== "On") await this.selectMode("On");
      this.targetTimer = setTimeout(() => (this.pendingTarget = undefined), HOLD_MS);
    }, DEBOUNCE_MS);
  }

  private settingValue(s: Setting): number {
    return this.pending[s.key] ?? this.num(s.key, this.attr(s.key, "min", s.fallback.min));
  }

  private stepSetting(s: Setting, direction: -1 | 1): void {
    const step = this.attr(s.key, "step", s.fallback.step);
    const min = this.attr(s.key, "min", s.fallback.min);
    const max = this.attr(s.key, "max", s.fallback.max);
    const value = Math.min(max, Math.max(min, Math.round((this.settingValue(s) + direction * step) / step) * step));
    haptic("light");
    this.pending = { ...this.pending, [s.key]: value };
    clearTimeout(this.settingTimers[s.key]);
    this.settingTimers[s.key] = setTimeout(async () => {
      await this.call("input_number", "set_value", { entity_id: this.entityId(s.key), value });
      this.settingTimers[s.key] = setTimeout(() => {
        const { [s.key]: _, ...rest } = this.pending;
        this.pending = rest;
      }, HOLD_MS);
    }, DEBOUNCE_MS);
  }

  private onPower(value: string): void {
    if (value === "off") void this.selectMode("Off");
    else if (this.mode === "Off") void this.selectMode("On");
  }

  private onPreset(event: Event, preset: Preset): void {
    const button = event.currentTarget as HTMLElement & { status: "idle" };
    if (preset === "Boost" && this.mode === "Boost") {
      const before = this.v("before_boost") as HeatingMode;
      void runAction(button, () => this.selectMode(RESTORE_MODES.includes(before) ? before : "On"));
    } else if (preset !== this.mode) {
      void runAction(button, () => this.selectMode(preset));
    }
  }

  private async toggleView(): Promise<void> {
    const card = this.renderRoot.querySelector<HTMLElement>("ha-card");
    const from = card?.offsetHeight ?? 0;
    this.switched = true;
    this.view = this.view === "main" ? "settings" : "main";
    await this.updateComplete;
    animateHeight(card, from);
  }

  private onRoom(name: string): void {
    haptic("selection");
    void this.call("input_select", "select_option", { entity_id: this.entityId("leading"), option: name });
  }

  // Minutes left and the fraction of the boost still to run, while Boost is active.
  private get boost(): { minutes: number; left: number } | undefined {
    const timer = this.st("boost_timer");
    const finishes = Date.parse(String(timer?.attributes.finishes_at ?? ""));
    if (this.mode !== "Boost" || Number.isNaN(finishes)) return undefined;
    const remaining = Math.max(0, finishes - Date.now());
    const total = parseDuration(timer?.attributes.duration) ?? this.num("boost_minutes", 60) * 60_000;
    return { minutes: Math.round(remaining / 60_000), left: total ? remaining / total : 0 };
  }

  // Rooms named in the battery sensor's low_sensors list ("Kelder (2.1 V)").
  private get lowBattery(): string[] {
    const low = this.st("battery_low");
    if (low?.state !== "on") return [];
    const list = low.attributes.low_sensors;
    return Array.isArray(list) ? list.map(String) : [];
  }

  private renderBanners(offline: boolean, lead: string): TemplateResult[] {
    const t = this.t;
    const banners: TemplateResult[] = [];
    if (offline) banners.push(html`<yvz-banner tone="error">${t("heating.banner_offline")}</yvz-banner>`);
    if (this.v("no_warmup") === "on") banners.push(html`<yvz-banner>${t("heating.banner_no_warmup")}</yvz-banner>`);
    if (this.v("sensor_problem") === "on") {
      banners.push(html`<yvz-banner>${t("heating.banner_sensor", { room: lead })}</yvz-banner>`);
    }
    const low = this.lowBattery;
    if (low.length) {
      banners.push(
        html`<yvz-banner tone="info" icon="mdi:battery-alert-variant-outline"
          >${t("heating.banner_battery", { rooms: low.join(", ") })}</yvz-banner
        >`,
      );
    }
    return banners;
  }

  private renderDialText(off: boolean, offline: boolean, current: number | undefined): TemplateResult {
    const t = this.t;
    const now = t("heating.now", { temp: current == null ? "–" : this.temp(current) });
    if (offline) {
      return html`<span class="big word">${t("heating.offline")}</span><span class="sub">${t("heating.no_connection")}</span>`;
    }
    if (off) {
      const frost = this.v("frost_enabled") === "on";
      return html`<span class="big word">${t("heating.off")}</span>
        <span class="sub">${now}</span>
        <span class="note">${frost ? t("heating.frost_hold", { temp: this.temp(this.num("frost_temp", 5)) }) : t("heating.is_off")}</span>`;
    }
    const trend = parseFloat(this.v("trend") ?? "");
    const trendText =
      current == null || Number.isNaN(trend)
        ? ""
        : trend > TREND_THRESHOLD
          ? t("heating.rising")
          : trend < -TREND_THRESHOLD
            ? t("heating.falling")
            : t("heating.steady");
    const [whole, fraction] = this.splitTemp(this.targetTween.set(this.setpoint) ?? this.setpoint);
    return html`<span class="big"><span>${whole}</span><span class="fraction">${fraction}</span></span>
      <span class="sub">${trendText ? `${now} · ${trendText}` : now}</span>`;
  }

  private renderPreset(key: Preset, offline: boolean): TemplateResult {
    const t = this.t;
    const boost = key === "Boost" ? this.boost : undefined;
    const icon = { Eco: "mdi:leaf", Comfort: "mdi:sofa", Boost: "mdi:rocket-launch" }[key];
    const label = { Eco: t("heating.eco"), Comfort: t("heating.comfort"), Boost: t("heating.boost") }[key];
    const detail =
      key === "Eco"
        ? this.temp(this.num("eco", 17))
        : key === "Comfort"
          ? this.temp(this.num("comfort", 20))
          : t("common.minutes_short", { count: boost?.minutes ?? this.num("boost_minutes", 60) });
    return html`<yvz-button
      outline
      .icon=${icon}
      ?active=${this.mode === key}
      ?disabled=${offline}
      .progress=${boost?.left}
      @click=${(e: Event) => this.onPreset(e, key)}
    >
      <span class="preset"><span>${label}</span>${this.config?.compact ? nothing : html`<small>${detail}</small>`}</span>
    </yvz-button>`;
  }

  private renderRooms(lead: string, offline: boolean): TemplateResult {
    const t = this.t;
    const map = (this.st("sensors")?.attributes.map ?? {}) as Record<string, string>;
    const frost = this.num("frost_temp", 5);
    const low = this.lowBattery;
    const rooms = Object.keys(map)
      .sort()
      .map((name) => {
        const n = parseFloat(this.hass?.states[map[name]]?.state ?? "");
        const missing = Number.isNaN(n);
        const badges: TileBadge[] = [];
        if (!missing && n <= frost) badges.push({ icon: "mdi:snowflake", state: "standby" });
        if (low.some((l) => l.startsWith(`${name} (`))) badges.push({ icon: "mdi:battery-alert-variant-outline", state: "error" });
        if (name === lead) badges.push({ icon: "mdi:thermostat" });
        return html`<yvz-tile
          outline
          .label=${name}
          .value=${missing ? "–" : this.temp(n)}
          .badges=${badges}
          ?selected=${name === lead}
          ?muted=${missing}
          ?disabled=${offline}
          @click=${() => name !== lead && this.onRoom(name)}
        ></yvz-tile>`;
      });
    return html`<div class="rooms">
      <yvz-section-title>${t("heating.rooms")}</yvz-section-title>
      ${rooms.length ? html`<div class="tiles">${rooms}</div>` : html`<p class="hint">${t("heating.no_rooms")}</p>`}
    </div>`;
  }

  private renderMain(off: boolean, offline: boolean, lead: string): TemplateResult {
    const t = this.t;
    const raw = parseFloat(this.v("control") ?? "");
    const current = Number.isNaN(raw) || this.v("sensor_problem") === "on" ? undefined : raw;
    const power: SegmentOption[] = [
      { value: "on", label: t("heating.on") },
      { value: "off", label: t("heating.off"), state: "off" },
    ];
    const nudge = (direction: -1 | 1) => () => this.nudge(direction);
    return html`<div class="main">
      <div class="control">
        <yvz-dial
          ?ambient=${!off && !offline}
          .min=${this.attr("climate", "min_temp", 5)}
          .max=${this.attr("climate", "max_temp", 25)}
          .value=${offline ? undefined : current}
          .target=${off || offline ? undefined : this.setpoint}
        >
          ${this.renderDialText(off, offline, current)}
          <yvz-icon-button
            slot="start"
            raised
            repeat
            class=${off || offline ? "away" : ""}
            icon="mdi:minus"
            .label=${t("heating.lower")}
            ?disabled=${off || offline}
            @click=${nudge(-1)}
            @yvz-repeat=${nudge(-1)}
          ></yvz-icon-button>
          <yvz-icon-button
            slot="end"
            raised
            repeat
            class=${off || offline ? "away" : ""}
            icon="mdi:plus"
            .label=${t("heating.higher")}
            ?disabled=${off || offline}
            @click=${nudge(1)}
            @yvz-repeat=${nudge(1)}
          ></yvz-icon-button>
        </yvz-dial>
        <yvz-segmented
          outline
          class="power"
          .label=${t("heating.power")}
          .options=${power}
          .value=${off ? "off" : "on"}
          ?disabled=${offline}
          @yvz-select=${(e: CustomEvent<{ value: string }>) => this.onPower(e.detail.value)}
        ></yvz-segmented>
        <div class="row presets">
          ${this.renderPreset("Eco", offline)} ${this.renderPreset("Comfort", offline)} ${this.renderPreset("Boost", offline)}
        </div>
      </div>
      ${this.renderRooms(lead, offline)}
    </div>`;
  }

  private renderSettings(): TemplateResult {
    const t = this.t;
    const settings: Setting[] = [
      { key: "comfort", label: t("heating.comfort"), fallback: { min: 15, max: 25, step: 0.5 } },
      { key: "eco", label: t("heating.eco"), fallback: { min: 10, max: 20, step: 0.5 } },
      { key: "boost_minutes", label: t("heating.boost_duration"), fallback: { min: 15, max: 180, step: 15 }, minutes: true },
    ];
    const frostTemp: Setting = { key: "frost_temp", label: t("heating.frost_temp"), fallback: { min: 5, max: 10, step: 0.5 } };
    const frostOn = this.v("frost_enabled") === "on";
    const stepper = (s: Setting, disabled = false) => {
      const v = this.settingValue(s);
      return html`<yvz-setting-row .label=${s.label} ?disabled=${disabled}>
        <yvz-stepper
          repeat
          ?disabled=${disabled}
          .decreaseLabel=${`${s.label}: ${t("common.decrease")}`}
          .increaseLabel=${`${s.label}: ${t("common.increase")}`}
          @yvz-step=${(e: CustomEvent<{ direction: -1 | 1 }>) => this.stepSetting(s, e.detail.direction)}
          ><span class="value">${s.minutes ? t("common.minutes_short", { count: v }) : this.temp(v)}</span></yvz-stepper
        >
      </yvz-setting-row>`;
    };
    const frostOptions: SegmentOption[] = [
      { value: "off", label: t("heating.off"), state: "off" },
      { value: "on", label: t("heating.on"), state: "standby" },
    ];
    return html`<div class="settings">
      <yvz-section-title>${t("heating.settings")}</yvz-section-title>
      ${settings.map((s) => stepper(s))}
      <yvz-setting-row .label=${t("heating.frost")}>
        <yvz-segmented
          outline
          class="toggle"
          .label=${t("heating.frost")}
          .options=${frostOptions}
          .value=${frostOn ? "on" : "off"}
          @yvz-select=${() => {
            haptic("selection");
            void this.call("input_boolean", "toggle", { entity_id: this.entityId("frost_enabled") });
          }}
        ></yvz-segmented>
      </yvz-setting-row>
      ${stepper(frostTemp, !frostOn)}
      <p class="hint">${t("heating.frost_hint")}</p>
    </div>`;
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    const t = this.t;
    const climate = this.st("climate");
    const offline = this.v("offline") === "on" || !climate || UNAVAILABLE.includes(climate.state);
    const off = this.mode === "Off";
    const pumpEntity = this.st("pump");
    const pump = pumpEntity?.state === "on";
    const role: YvzState = offline ? "unavailable" : off ? "off" : pump ? "on" : "standby";
    const lead = this.v("leading") ?? "";
    const settings = this.view === "settings";
    const pumpFor = pump && !offline && pumpEntity ? Date.now() - Date.parse(pumpEntity.last_changed) : NaN;

    return html`
      <ha-card data-state=${role} class=${this.config.compact ? "compact" : ""}>
        <yvz-card-header
          icon="mdi:radiator"
          .heading=${this.config.name ?? t("heating.default_name")}
          .subtitle=${offline ? t("heating.offline") : pump ? t("heating.pump_on") : t("heating.pump_off")}
        >
          ${Number.isNaN(pumpFor)
            ? nothing
            : html`<yvz-chip slot="end" icon="mdi:pump">${formatDuration(t, pumpFor)}</yvz-chip>`}
          <yvz-icon-button
            slot="end"
            .icon=${settings ? "mdi:close" : "mdi:cog"}
            .label=${settings ? t("heating.close") : t("heating.settings")}
            @click=${this.toggleView}
          ></yvz-icon-button>
        </yvz-card-header>
        <div class="banners">${this.renderBanners(offline, lead)}</div>
        <div class="view ${this.switched ? (settings ? "from-end" : "from-start") : ""}">
          ${settings ? this.renderSettings() : this.renderMain(off, offline, lead)}
        </div>
      </ha-card>
    `;
  }

  static override styles: CSSResultGroup = [
    YvzCard.styles,
    viewSwapStyles,
    css`
      ha-card {
        container-type: inline-size;
      }

      .banners {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-2);
      }

      .banners:not(:empty) {
        margin-top: var(--yvz-space-3);
      }

      .main {
        display: grid;
        gap: var(--yvz-space-5);
        margin-top: var(--yvz-space-3);
      }

      @container (min-width: 640px) {
        .main {
          grid-template-columns: minmax(300px, 380px) 1fr;
          gap: var(--yvz-space-6);
          align-items: start;
        }
      }

      .control {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-3);
      }

      /* runs whenever the centre switches between target, off and offline */
      @keyframes enter {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
      }

      yvz-dial .big,
      yvz-dial .sub,
      yvz-dial .note {
        animation: enter var(--yvz-duration-slow) var(--yvz-ease);
      }

      yvz-dial yvz-icon-button {
        transition:
          opacity var(--yvz-duration-base) var(--yvz-ease),
          transform var(--yvz-duration-base) var(--yvz-ease);
      }

      yvz-dial yvz-icon-button.away {
        opacity: 0;
        transform: scale(0.8);
      }

      yvz-dial .big {
        display: flex;
        align-items: flex-start;
        color: var(--yvz-text);
        font-size: 52px;
        font-weight: var(--yvz-weight-medium);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.03em;
        line-height: 56px;
      }

      /* decimals and degree sign sit smaller and raised, like a thermostat display */
      yvz-dial .fraction {
        margin: 0.3em 0 0 1px;
        font-size: 0.42em;
        line-height: 1;
        letter-spacing: normal;
      }

      yvz-dial .big.word {
        font-size: var(--yvz-text-big);
        line-height: var(--yvz-line-big);
        letter-spacing: normal;
      }

      yvz-dial .sub {
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-body);
        line-height: var(--yvz-line-body);
      }

      yvz-dial .note {
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        line-height: var(--yvz-line-label);
      }

      .row {
        display: grid;
        grid-auto-columns: 1fr;
        grid-auto-flow: column;
        gap: var(--yvz-space-2);
      }

      .power {
        --yvz-segmented-height: 44px;
      }

      .presets {
        --yvz-button-height: 52px;
      }

      .preset {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        min-width: 0;
        line-height: var(--yvz-line-label);
      }

      .preset small {
        font-size: var(--yvz-text-label);
        opacity: 0.7;
        font-variant-numeric: tabular-nums;
      }

      .rooms {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-2);
      }

      .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: var(--yvz-space-2);
      }

      .settings {
        margin-top: var(--yvz-space-4);
      }

      .settings yvz-section-title {
        margin-bottom: var(--yvz-space-1);
      }

      yvz-stepper {
        width: 168px;
      }

      yvz-stepper .value {
        color: var(--yvz-text);
        font-weight: var(--yvz-weight-medium);
        font-variant-numeric: tabular-nums;
      }

      .toggle {
        width: 168px;
        --yvz-segmented-height: 32px;
      }

      .hint {
        margin: var(--yvz-space-3) 0 0;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        line-height: var(--yvz-line-label);
      }

      /* compact: smaller dial and controls, single-line presets, shorter tiles */
      .compact yvz-dial {
        --yvz-dial-button-size: 40px;
        max-width: 220px;
      }

      .compact yvz-dial .big {
        font-size: 38px;
        line-height: 42px;
      }

      .compact yvz-dial .big.word {
        font-size: var(--yvz-text-big);
        line-height: var(--yvz-line-big);
      }

      .compact .main,
      .compact .control {
        gap: var(--yvz-space-2);
      }

      .compact .presets {
        --yvz-button-height: 44px;
      }

      .compact .power {
        --yvz-segmented-height: 36px;
      }

      .compact .tiles {
        --yvz-tile-height: 60px;
      }
    `,
  ];
}

registerCard({
  type: "yvz-heating-card",
  name: "YVZ Heating",
  description: "Thermostat dial with on/off, presets, boost and a room picker for the leading sensor.",
});

declare global {
  interface HTMLElementTagNameMap {
    "yvz-heating-card": YvzHeatingCard;
  }
}
