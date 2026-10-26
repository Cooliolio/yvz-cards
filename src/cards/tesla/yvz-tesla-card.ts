import { css, html, nothing, type CSSResultGroup, type PropertyValues, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import "../../design";
import type { SegmentOption, TileBadge, YvzState } from "../../design";
import { formatDuration, formatNumber, formatTime } from "../../shared/format";
import type { TranslationKey } from "../../shared/i18n";
import { haptic } from "../../shared/haptic";
import { fireMoreInfo } from "../../shared/more-info";
import { registerCard } from "../../shared/register-card";
import { animateHeight, viewSwapStyles } from "../../design/view-swap";
import { TickController } from "../../shared/tick-controller";
import type { HassEntity, HomeAssistant, LovelaceCardConfig } from "../../shared/types";
import { YvzCard } from "../../shared/yvz-card";
import { carStyles, hexToRgb, renderCar } from "./car";
import "./yvz-tesla-card-editor";
import { loadPrefs, savePrefs, type TeslaPrefs } from "./prefs";
import { findTeslaDevice, resolveEntities, type ResolvedEntities } from "./resolve";
import {
  CONTROL_GROUPS,
  CONTROL_KEYS,
  CONTROLS,
  DEFAULT_CONTROLS,
  DOOR_KEYS,
  PAINTS,
  STALE_MINUTES,
  TPMS_KEYS,
  WINDOW_KEYS,
  type ControlGroup,
  type ControlKey,
  type TeslaCardConfig,
  type TeslaEntityKey,
} from "./types";

const LEVELS = ["off", "low", "medium", "high"];
const NO_VALUE = ["unknown", "unavailable", undefined, null, ""];
const ARM_MS = 4000;
const TEMP_DEBOUNCE_MS = 900;
// How long an optimistic value wins over HA's state after it was sent.
const HOLD_MS = 2500;
const TEMP_HOLD_MS = 15_000;
const FLASH_MS = 2200;
// Same idea as the other cards: relative times ("5 min ago") stay fresh.
const TICK_MS = 60_000;

interface ChipSpec {
  state: YvzState;
  icon: string;
  text: string;
  more?: TeslaEntityKey;
}

@customElement("yvz-tesla-card")
export class YvzTeslaCard extends YvzCard<TeslaCardConfig> {
  // Control (or "wake-car") that waits for its confirming second tap.
  @state() private armed?: string;
  @state() private pendingTemp?: number;
  @state() private limitDraft?: number;
  @state() private flashUntil = 0;
  @state() private view: "main" | "settings" = "main";
  // Set after the first toggle, so the initial render doesn't slide in.
  @state() private switched = false;
  @state() private prefs: TeslaPrefs = {};

  private lastLock?: string;
  private resolved: ResolvedEntities = { entities: {} };
  private resolvedFor?: { config?: TeslaCardConfig; registry?: unknown };
  private armTimer?: ReturnType<typeof setTimeout>;
  private tempTimer?: ReturnType<typeof setTimeout>;
  private limitTimer?: ReturnType<typeof setTimeout>;
  private flashTimer?: ReturnType<typeof setTimeout>;
  private wakeTimers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    super();
    new TickController(this, TICK_MS);
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("yvz-tesla-card-editor");
  }

  static getStubConfig(hass?: HomeAssistant): Partial<TeslaCardConfig> {
    const device_id = findTeslaDevice(hass);
    return device_id ? { device_id } : { prefix: "model_3" };
  }

  setConfig(config: LovelaceCardConfig): void {
    if (!config || typeof config !== "object") throw new Error("yvz-tesla-card: invalid configuration");
    this.config = config as TeslaCardConfig;
    this.prefs = loadPrefs(this.config);
    this.view = "main";
    this.armed = undefined;
    this.pendingTemp = undefined;
  }

  override getCardSize(): number {
    return this.config?.compact ? 3 : 8;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const timer of [this.armTimer, this.tempTimer, this.limitTimer, this.flashTimer, ...this.wakeTimers]) {
      clearTimeout(timer);
    }
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (!this.config || !this.hass) return;
    this.blinkOnLockChange();
    if (!changed.has("config") && !changed.has("hass")) return;
    const registry = this.hass.entities;
    if (this.resolvedFor?.config === this.config && this.resolvedFor.registry === registry) return;
    this.resolved = resolveEntities(this.config, this.hass);
    this.resolvedFor = { config: this.config, registry };
  }

  /* ---------- settings ---------- */

  private get shownControls(): ControlKey[] {
    const list = this.prefs.controls ?? this.config?.controls ?? DEFAULT_CONTROLS;
    return list.filter((k) => k in CONTROLS);
  }

  private get showClimate(): boolean {
    return this.prefs.climate ?? this.config?.show_climate !== false;
  }

  private get showLimit(): boolean {
    return this.prefs.limit ?? this.config?.show_charge_limit !== false;
  }

  private setPrefs(prefs: TeslaPrefs): void {
    this.prefs = prefs;
    savePrefs(this.config!, prefs);
  }

  private toggleControl(key: ControlKey): void {
    haptic("selection");
    const shown = this.shownControls;
    this.setPrefs({
      ...this.prefs,
      controls: shown.includes(key) ? shown.filter((k) => k !== key) : [...shown, key],
    });
  }

  private async toggleView(): Promise<void> {
    const card = this.renderRoot.querySelector<HTMLElement>("ha-card");
    const from = card?.offsetHeight ?? 0;
    this.switched = true;
    this.view = this.view === "main" ? "settings" : "main";
    await this.updateComplete;
    animateHeight(card, from);
  }

  // The car blinks its lights when it locks or unlocks, whoever did it.
  private blinkOnLockChange(): void {
    const lock = this.st("lock")?.state;
    if (lock !== "locked" && lock !== "unlocked") return;
    if (this.lastLock && this.lastLock !== lock) this.flash();
    this.lastLock = lock;
  }

  /* ---------- state access ---------- */

  private st(key: TeslaEntityKey): HassEntity | undefined {
    const id = this.resolved.entities[key];
    return id ? this.hass?.states[id] : undefined;
  }

  private has(key: TeslaEntityKey): boolean {
    return !!this.resolved.entities[key];
  }

  private ok(key: TeslaEntityKey): boolean {
    const st = this.st(key);
    return !!st && !NO_VALUE.includes(st.state);
  }

  private on(key: TeslaEntityKey): boolean {
    return this.st(key)?.state === "on";
  }

  private num(key: TeslaEntityKey): number | null {
    const st = this.st(key);
    if (!st || NO_VALUE.includes(st.state)) return null;
    const n = Number(st.state);
    return Number.isFinite(n) ? n : null;
  }

  private unit(key: TeslaEntityKey, fallback: string): string {
    return String(this.st(key)?.attributes.unit_of_measurement ?? fallback);
  }

  private get noData(): boolean {
    return this.has("status") && NO_VALUE.includes(this.st("status")?.state);
  }

  private get asleep(): boolean {
    return this.has("status") && this.st("status")?.state === "off";
  }

  private get driving(): boolean {
    if (this.noData || this.asleep) return false;
    const shift = String(this.st("shift")?.state ?? "").toLowerCase();
    if (["d", "r", "n"].includes(shift)) return true; // keeps spinning until it reports P
    if (shift === "p") return false;
    const speed = this.num("speed");
    return speed !== null && speed > 0;
  }

  // "open" from Tesla Fleet is meaningless without data (a missing value reads as open).
  private openTrusted(key: TeslaEntityKey): boolean {
    return !this.noData && this.st(key)?.state === "open";
  }

  private get windowsOpen(): boolean {
    return !this.noData && (this.st("windows")?.state === "open" || WINDOW_KEYS.some((k) => this.on(k)));
  }

  private temp(v: number): string {
    return `${formatNumber(this.hass!, v, { maximumFractionDigits: 1 })}°`;
  }

  /* ---------- derived values ---------- */

  // Minutes since the car last reported.
  private get age(): number | null {
    const st = this.st("battery");
    const ts = st?.last_reported ?? st?.last_updated;
    return ts ? Math.max(0, Math.round((Date.now() - Date.parse(ts)) / 60_000)) : null;
  }

  // Time left to full as ms; the sensor is either a timestamp or hours/minutes.
  private get timeToFull(): number | null {
    const st = this.st("time_to_full");
    if (!st || NO_VALUE.includes(st.state)) return null;
    const n = Number(st.state);
    let ms: number;
    if (Number.isFinite(n)) ms = st.attributes.unit_of_measurement === "min" ? n * 60_000 : n * 3_600_000;
    else {
      const at = Date.parse(st.state);
      if (Number.isNaN(at)) return null;
      ms = at - Date.now();
    }
    return ms > 0 ? ms : null;
  }

  private get location(): string | null {
    const st = this.st("location");
    if (!st || NO_VALUE.includes(st.state)) return null;
    if (st.state === "home") return this.t("tesla.home");
    if (st.state === "not_home") return this.t("tesla.away");
    return st.state;
  }

  private get rgb(): [number, number, number] {
    const { paint, paint_rgb } = this.config ?? {};
    if (paint === "custom" && Array.isArray(paint_rgb)) return paint_rgb;
    return hexToRgb(PAINTS[paint && paint !== "custom" ? paint : "stealth_grey"].hex);
  }

  /* ---------- actions ---------- */

  private call(domain: string, service: string, key: TeslaEntityKey, data: Record<string, unknown> = {}): void {
    const entity_id = this.resolved.entities[key];
    if (!entity_id) return;
    void this.hass!.callService(domain, service, { entity_id, ...data });
    if (domain === "button" && key === "wake") this.refreshAfterWake();
  }

  // A woken car needs a moment before it reports; ask HA to poll again.
  private refreshAfterWake(): void {
    const entity_id = (["status", "battery"] as const).map((k) => this.resolved.entities[k]).filter(Boolean);
    if (!entity_id.length) return;
    this.wakeTimers.forEach(clearTimeout);
    const poll = () => void this.hass?.callService("homeassistant", "update_entity", { entity_id }).catch(() => {});
    this.wakeTimers = [setTimeout(poll, 20_000), setTimeout(poll, 60_000)];
  }

  // First tap arms, second tap (within ARM_MS) goes.
  private arm(id: string): boolean {
    clearTimeout(this.armTimer);
    if (this.armed === id) {
      this.armed = undefined;
      return true;
    }
    haptic("warning");
    this.armed = id;
    this.armTimer = setTimeout(() => (this.armed = undefined), ARM_MS);
    return false;
  }

  private onControl(key: ControlKey): void {
    const def = CONTROLS[key];
    const st = this.st(key);
    if (!st) return;
    const kind: string = def.kind;
    if (st.state === "unavailable" || (kind !== "button" && NO_VALUE.includes(st.state))) return;
    if (kind !== "button" && this.noData) return;
    if (kind === "open_only" && st.state === "open") return; // the frunk can't be closed remotely
    if ("arm" in def && def.arm && !this.arm(key)) return;
    haptic("selection");

    switch (def.kind) {
      case "lock":
        this.call("lock", st.state === "locked" ? "unlock" : "lock", key);
        break;
      case "toggle":
        this.call("switch", st.state === "on" ? "turn_off" : "turn_on", key);
        break;
      case "cycle": {
        const options: readonly string[] = def.options;
        const steps = options.filter((o) => !Array.isArray(st.attributes.options) || st.attributes.options.includes(o));
        this.call("select", "select_option", key, { option: steps[(steps.indexOf(st.state) + 1) % steps.length] });
        break;
      }
      case "cover":
        this.call("cover", st.state === "open" ? "close_cover" : "open_cover", key);
        break;
      case "open_only":
        this.call("cover", "open_cover", key);
        break;
      case "button":
        this.call("button", "press", key);
        if (key === "flash") this.flash();
        break;
    }
  }

  private flash(): void {
    this.flashUntil = Date.now() + FLASH_MS;
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => (this.flashUntil = 0), FLASH_MS);
  }

  private onCar(): void {
    if (!(this.asleep || this.noData) || !this.has("wake")) return;
    if (!this.arm("wake-car")) return;
    haptic("selection");
    this.call("button", "press", "wake");
  }

  private onClimatePower(e: CustomEvent<{ value: string }>): void {
    const st = this.st("climate");
    if (!st || NO_VALUE.includes(st.state)) return;
    haptic("selection");
    this.call("climate", e.detail.value === "on" ? "turn_on" : "turn_off", "climate");
  }

  private nudge(direction: -1 | 1): void {
    const st = this.st("climate");
    if (!st || NO_VALUE.includes(st.state)) return;
    const a = st.attributes;
    const step = Number(a.target_temp_step) || 0.5;
    const min = Number(a.min_temp ?? 15);
    const max = Number(a.max_temp ?? 28);
    const current = this.pendingTemp ?? Number(a.temperature ?? 21);
    haptic("light");
    this.pendingTemp = Math.min(max, Math.max(min, Math.round((current + direction * step) / step) * step));
    // Several taps become one command; each command costs API credit.
    clearTimeout(this.tempTimer);
    this.tempTimer = setTimeout(() => {
      this.call("climate", "set_temperature", "climate", { temperature: this.pendingTemp });
      this.tempTimer = setTimeout(() => (this.pendingTemp = undefined), TEMP_HOLD_MS);
    }, TEMP_DEBOUNCE_MS);
  }

  private onLimitInput(e: CustomEvent<{ value: number }>): void {
    this.limitDraft = e.detail.value;
  }

  private onLimitCommit(e: CustomEvent<{ value: number }>): void {
    const { value } = e.detail;
    haptic("light");
    this.limitDraft = value;
    this.call("number", "set_value", "charge_limit", { value });
    clearTimeout(this.limitTimer);
    this.limitTimer = setTimeout(() => (this.limitDraft = undefined), HOLD_MS);
  }

  // Makes a clickable element work with Enter and Space too.
  private key = (action: () => void) => (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    action();
  };

  private more(key: TeslaEntityKey | undefined): void {
    if (key) fireMoreInfo(this, this.resolved.entities[key]);
  }

  /* ---------- render pieces ---------- */

  private chips(): ChipSpec[] {
    const t = this.t;
    const hass = this.hass!;
    const chips: ChipSpec[] = [];
    // One chip is always there (what the car is doing), so the row never changes height.
    if (this.noData) chips.push({ state: "unavailable", icon: "mdi:cloud-off-outline", text: t("common.no_data"), more: "status" });
    else if (this.asleep) chips.push({ state: "unavailable", icon: "mdi:sleep", text: t("tesla.asleep"), more: "status" });
    else if (this.driving) {
      const speed = this.num("speed");
      const unit = this.unit("speed", "km/h");
      chips.push({
        state: "standby",
        icon: "mdi:steering",
        text: speed ? `${t("tesla.driving")} · ${formatNumber(hass, Math.round(speed))} ${unit}` : t("tesla.driving"),
        more: "shift",
      });
    } else chips.push({ state: "off", icon: "mdi:parking", text: t("tesla.parked"), more: "status" });

    // Locked and the temperature live in the subtitle; the chip only shows when the car is unlocked.
    if (this.st("lock")?.state === "unlocked") {
      chips.push({ state: "pending", icon: "mdi:lock-open-variant", text: t("tesla.unlocked"), more: "lock" });
    }

    const plugged = this.on("cable");
    const open = [
      this.openTrusted("frunk") && t("tesla.thing.frunk"),
      this.openTrusted("trunk") && t("tesla.thing.trunk"),
      !this.noData && DOOR_KEYS.some((k) => this.on(k)) && t("tesla.thing.door"),
      this.windowsOpen && t("tesla.thing.windows"),
      this.openTrusted("charge_port") && !plugged && t("tesla.thing.port"),
    ].filter(Boolean);
    if (open.length) chips.push({ state: "pending", icon: "mdi:alert", text: t("tesla.open_things", { things: open.join(", ") }) });

    if (TPMS_KEYS.some((k) => this.on(k))) chips.push({ state: "pending", icon: "mdi:car-tire-alert", text: t("tesla.tires"), more: "tpms_fl" });
    if (this.on("update")) chips.push({ state: "standby", icon: "mdi:update", text: t("tesla.update"), more: "update" });
    if (this.on("sentry")) chips.push({ state: "error", icon: "mdi:record-circle", text: t("tesla.sentry"), more: "sentry" });
    return chips;
  }

  private get stale(): boolean {
    const age = this.age;
    return age !== null && !this.noData && age >= STALE_MINUTES;
  }

  // Battery level as a line gauge: the label says what the car is doing, the marker is the charge limit.
  private renderBattery(charging: boolean): TemplateResult {
    const t = this.t;
    const hass = this.hass!;
    const limit = this.limitDraft ?? this.num("charge_limit");
    const state = String(this.st("charging")?.state ?? "");
    const plugged = this.on("cable");
    const pct = this.num("battery");
    let label = t("tesla.battery");
    let icon = "mdi:battery-high";
    let tone: YvzState | undefined;
    let done = false;
    if (charging) {
      const power = this.num("charger_power");
      const added = this.num("energy_added");
      const left = this.timeToFull;
      label = [
        t("tesla.charging"),
        power ? `${formatNumber(hass, power, { maximumFractionDigits: 1 })} kW` : null,
        left ? t("tesla.full_in", { time: formatDuration(t, left), at: formatTime(hass, Date.now() + left) }) : null,
        added ? `+${formatNumber(hass, added, { maximumFractionDigits: 1 })} kWh` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      icon = "mdi:lightning-bolt";
    } else if (state === "complete" && plugged) {
      label = t("tesla.charging_done");
      icon = "mdi:battery-check";
      done = true;
    } else if (state === "no_power" || state === "nopower") {
      label = t("tesla.no_power");
      icon = "mdi:power-plug-off";
      tone = "error";
    } else if (plugged) {
      // Plugged in and not charging only needs a nudge while the battery is below its limit.
      const needsCharge = pct !== null && limit !== null && pct < limit;
      label = t("tesla.plugged_idle");
      icon = "mdi:ev-plug-type2";
      if (needsCharge) tone = "pending";
    }
    return html`<div class="battery" role="button" tabindex="0" @click=${() => this.more("battery")} @keydown=${this.key(() => this.more("battery"))}>
      <yvz-gauge
        .icon=${icon}
        .label=${label}
        .value=${this.num("battery") ?? undefined}
        .display=${limit === null ? "" : t("tesla.limit", { value: formatNumber(hass, Math.round(limit)) })}
        .target=${limit ?? undefined}
        .warnAt=${40}
        .errorAt=${20}
        invert
        .tone=${tone}
        ?pulse=${charging}
        ?done=${done}
        .locale=${hass.locale?.language ?? hass.language}
      ></yvz-gauge>
    </div>`;
  }

  private renderLimit(): TemplateResult | typeof nothing {
    const t = this.t;
    const st = this.st("charge_limit");
    const limit = this.num("charge_limit");
    if (!this.showLimit || !st || limit === null) return nothing;
    const value = this.limitDraft ?? limit;
    return html`<yvz-setting-row .label=${t("tesla.charge_limit")}>
      <div class="slider">
        <yvz-slider
          .label=${t("tesla.charge_limit")}
          .min=${Number(st.attributes.min ?? 50)}
          .max=${Number(st.attributes.max ?? 100)}
          .step=${Number(st.attributes.step ?? 1)}
          .value=${value}
          @yvz-input=${this.onLimitInput}
          @yvz-change=${this.onLimitCommit}
        ></yvz-slider>
        <span class="value">${formatNumber(this.hass!, Math.round(value))}%</span>
      </div>
    </yvz-setting-row>`;
  }

  // The climate section holds the panel (when shown) and the heater tiles.
  private renderClimate(heaters: TemplateResult | typeof nothing): TemplateResult | typeof nothing {
    const t = this.t;
    const st = this.st("climate");
    const panel = this.showClimate && !!st;
    if (!panel) {
      return heaters === nothing
        ? nothing
        : html`<div class="section"><yvz-section-title>${t("tesla.section_climate")}</yvz-section-title>${heaters}</div>`;
    }
    const ok = this.ok("climate");
    const active = ok && st.state !== "off";
    const target = this.pendingTemp ?? Number(st.attributes.temperature);
    const power: SegmentOption[] = [
      { value: "on", label: t("role.on") },
      { value: "off", label: t("role.off"), state: "off" },
    ];
    return html`<div class="section" data-state=${active ? "heat" : nothing}>
      <yvz-section-title>${t("tesla.section_climate")}</yvz-section-title>
      <yvz-segmented
        outline
        class="power"
        .label=${t("tesla.climate_power")}
        .options=${power}
        .value=${active ? "on" : "off"}
        ?disabled=${!ok}
        @yvz-select=${this.onClimatePower}
      ></yvz-segmented>
      <yvz-setting-row .label=${t("tesla.target")} ?disabled=${!ok}>
        <yvz-stepper
          repeat
          ?disabled=${!ok}
          .decreaseLabel=${`${t("tesla.target")}: ${t("common.decrease")}`}
          .increaseLabel=${`${t("tesla.target")}: ${t("common.increase")}`}
          @yvz-step=${(e: CustomEvent<{ direction: -1 | 1 }>) => this.nudge(e.detail.direction)}
          ><span class="value">${Number.isFinite(target) ? this.temp(target) : "–"}</span></yvz-stepper
        >
      </yvz-setting-row>
      ${heaters}
    </div>`;
  }

  private renderTile(key: ControlKey): TemplateResult | typeof nothing {
    const t = this.t;
    const def = CONTROLS[key];
    const st = this.st(key);
    if (!st) return nothing;
    const kind: string = def.kind;
    const unavailable = st.state === "unavailable" || (kind !== "button" && (NO_VALUE.includes(st.state) || this.noData));
    let icon: string = def.icon;
    let value = "";
    let selected = false;
    let tone: YvzState | undefined;
    let warn = false;
    let steps = 0;
    let level = 0;
    let valueText = "";

    switch (def.kind) {
      case "lock": {
        const locked = st.state === "locked";
        icon = locked ? "mdi:lock" : "mdi:lock-open-variant";
        value = t(locked ? "tesla.locked" : "tesla.unlocked");
        warn = !locked;
        break;
      }
      case "toggle":
        selected = st.state === "on";
        value = t(selected ? "role.on" : "role.off");
        break;
      case "cycle": {
        // Every step is a dot, lit up to the current level; "off" is no dots lit.
        const options: readonly string[] = def.options;
        const available = options.filter((o) => !Array.isArray(st.attributes.options) || st.attributes.options.includes(o));
        steps = available.length - 1;
        level = Math.max(0, available.indexOf(st.state));
        selected = level > 0;
        valueText = LEVELS.includes(st.state) ? t(`tesla.level.${st.state}` as TranslationKey) : st.state;
        break;
      }
      case "cover":
      case "open_only":
        warn = st.state === "open";
        value = t(warn ? "tesla.open" : "tesla.closed");
        break;
    }

    // Heaters light up in the heat colour, like the climate section.
    if (selected && def.group === "climate") tone = "heat";

    if (this.armed === key) {
      selected = true;
      tone = "error";
      warn = false;
      steps = 0;
      value = t("common.confirm");
    }
    if (unavailable) {
      selected = false;
      warn = false;
      steps = 0;
      value = this.noData ? t("common.no_data") : this.asleep ? t("tesla.asleep") : t("common.unavailable");
    }

    const badges: TileBadge[] = [{ icon, state: warn ? "pending" : undefined }];
    return html`<yvz-tile
      outline
      data-state=${tone ?? nothing}
      .label=${t(`tesla.control.${key}` as TranslationKey)}
      .value=${value}
      .steps=${steps}
      .level=${level}
      .valueText=${valueText}
      .badges=${badges}
      ?selected=${selected}
      ?disabled=${unavailable}
      @click=${() => this.onControl(key)}
    ></yvz-tile>`;
  }

  private banner(age: number | null): TemplateResult | typeof nothing {
    if (!this.stale || age === null) return nothing;
    return html`<div class="banners"><yvz-banner>${this.t("tesla.stale", { time: formatDuration(this.t, age * 60_000) })}</yvz-banner></div>`;
  }

  // Sits under the battery so a chip appearing never pushes the car down.
  private renderChips(chips: ChipSpec[]): TemplateResult | typeof nothing {
    return html`<div class="chips">
      ${chips.map(
        (c) => html`<yvz-chip
          data-state=${c.state}
          .icon=${c.icon}
          class=${c.more ? "tap" : ""}
          role=${c.more ? "button" : nothing}
          tabindex=${c.more ? 0 : nothing}
          @click=${() => this.more(c.more)}
          @keydown=${c.more ? this.key(() => this.more(c.more)) : nothing}
          >${c.text}</yvz-chip
        >`,
      )}
    </div>`;
  }

  private settingTile(label: string, icon: string, shown: boolean, onToggle: () => void): TemplateResult {
    return html`<yvz-tile
      outline
      .label=${label}
      .badges=${[{ icon }]}
      ?selected=${shown}
      @click=${onToggle}
    ></yvz-tile>`;
  }

  private renderSettings(): TemplateResult {
    const t = this.t;
    const shown = this.shownControls;
    const group = (g: ControlGroup) =>
      CONTROL_KEYS.filter((k) => CONTROLS[k].group === g && this.st(k)).map((k) =>
        this.settingTile(t(`tesla.control.${k}` as TranslationKey), CONTROLS[k].icon, shown.includes(k), () => this.toggleControl(k)),
      );
    const title = (g: ControlGroup) => (g === "climate" ? t("tesla.section_climate") : t(`tesla.group.${g}` as TranslationKey));
    const panels = [
      ...(this.has("climate")
        ? [this.settingTile(t("tesla.panel_climate"), "mdi:thermometer", this.showClimate, () => this.setPrefs({ ...this.prefs, climate: !this.showClimate }))]
        : []),
      ...(this.has("charge_limit")
        ? [this.settingTile(t("tesla.charge_limit"), "mdi:battery-charging-high", this.showLimit, () => this.setPrefs({ ...this.prefs, limit: !this.showLimit }))]
        : []),
    ];
    const sections = [
      { title: t("tesla.panels"), tiles: panels },
      ...CONTROL_GROUPS.map((g) => ({ title: title(g), tiles: group(g) })),
    ].filter((s) => s.tiles.length);
    const customised = !!this.prefs.controls || this.prefs.climate !== undefined || this.prefs.limit !== undefined;
    return html`<div class="settings">
      ${sections.map(
        (s) => html`<div class="section"><yvz-section-title>${s.title}</yvz-section-title><div class="tiles">${s.tiles}</div></div>`,
      )}
      <p class="hint">${t("tesla.settings_hint")}</p>
      <yvz-button outline ?disabled=${!customised} @click=${() => this.setPrefs({})}>${t("tesla.reset")}</yvz-button>
    </div>`;
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    const t = this.t;
    const hass = this.hass;
    if (!this.has("battery")) {
      return html`<ha-card><p class="empty"><ha-icon icon="mdi:car-electric"></ha-icon>${t("tesla.empty")}</p></ha-card>`;
    }

    const config = this.config;
    const device = this.resolved.deviceId ? hass.devices?.[this.resolved.deviceId] : undefined;
    const name = config.name || device?.name_by_user || device?.name || t("tesla.default_name");
    const pct = this.num("battery");
    const range = this.num("range");
    const chargingState = this.st("charging")?.state;
    const charging = chargingState === "charging" || chargingState === "starting";
    const plugged = this.on("cable");
    const age = this.age;
    const driving = this.driving;
    const canWake = (this.asleep || this.noData) && this.has("wake");
    const compact = !!config.compact;

    const role: YvzState | undefined = this.noData
      ? "unavailable"
      : this.asleep
        ? "off"
        : this.stale
          ? "pending"
          : charging
            ? "on"
            : undefined;

    const location = this.location;
    const agoText =
      age === null || this.noData ? null : age < 1 ? t("tesla.just_now") : t("host.ago", { time: formatDuration(t, age * 60_000) });
    const lockState = this.st("lock")?.state;
    const inside = this.num("inside_temp");
    const subtitle = [
      location,
      agoText,
      lockState === "locked" ? t("tesla.locked") : null,
      inside === null ? null : `${formatNumber(hass, Math.round(inside))}${this.unit("inside_temp", "°C")}`,
    ]
      .filter(Boolean)
      .join(" · ");

    const chips = this.chips();
    const car = renderCar({
      rgb: this.rgb,
      frunk: this.openTrusted("frunk"),
      trunk: this.openTrusted("trunk"),
      doorOpen: !this.noData && DOOR_KEYS.some((k) => this.on(k)),
      windowOpen: this.windowsOpen,
      portOpen: this.openTrusted("charge_port"),
      plugged,
      charging,
      sentry: this.on("sentry"),
      flashing: Date.now() < this.flashUntil,
      driving,
      asleep: this.asleep,
      defrost: this.on("defrost"),
      climate: this.ok("climate") && this.st("climate")?.state !== "off",
      speed: driving ? this.num("speed") : null,
    });

    const drive = driving && !compact;
    const speed = driving ? this.num("speed") : null;
    const shift = String(this.st("shift")?.state ?? "").toUpperCase();
    const level = `${pct === null ? "–" : `${formatNumber(hass, Math.round(pct))}%`}${range === null ? "" : ` · ${formatNumber(hass, Math.round(range))} ${this.unit("range", "km")}`}`;
    const carWake = canWake && !compact;
    const carWrap = html`<div
      class="car-wrap ${carWake ? "wakeable" : ""}"
      role=${carWake ? "button" : nothing}
      tabindex=${carWake ? 0 : nothing}
      @click=${compact ? nothing : this.onCar}
      @keydown=${carWake ? this.key(() => this.onCar()) : nothing}
    >
      ${car}
      ${this.armed === "wake-car"
        ? html`<div class="overlay"><ha-icon icon="mdi:sleep-off"></ha-icon>${t("tesla.wake_confirm")}</div>`
        : carWake
          ? html`<div class="hint">${t("tesla.wake_hint")}</div>`
          : nothing}
    </div>`;
    const stats = html`<div class="stats" role="button" tabindex="0" @click=${() => this.more("battery")} @keydown=${this.key(() => this.more("battery"))}>
      ${drive
        ? html`<div class="pct">${speed === null ? "–" : formatNumber(hass, Math.round(speed))}<span>${this.unit("speed", "km/h")}</span></div>
            <div class="range">${[shift, level].filter(Boolean).join(" · ")}</div>`
        : html`<div class="pct">${pct === null ? "–" : formatNumber(hass, Math.round(pct))}<span>%</span></div>
            <div class="range">${range === null ? "–" : `${formatNumber(hass, Math.round(range))} ${this.unit("range", "km")}`}</div>`}
    </div>`;

    const header = html`
      <yvz-card-header icon="mdi:car-electric" .heading=${name} .subtitle=${subtitle}>
        ${compact
          ? nothing
          : html`<yvz-icon-button
              slot="end"
              .icon=${this.view === "settings" ? "mdi:close" : "mdi:cog"}
              .label=${this.view === "settings" ? t("tesla.close") : t("tesla.settings")}
              @click=${this.toggleView}
            ></yvz-icon-button>`}
      </yvz-card-header>
      ${this.view === "settings" && !compact ? nothing : this.banner(age)}
    `;
    const settings = this.view === "settings" && !compact;

    if (compact) {
      return html`<ha-card data-state=${role ?? nothing} class="compact">
        ${header}
        <div class="glance">
          ${carWrap}
          <div class="side">${stats} ${this.renderBattery(charging)}</div>
        </div>
        ${this.renderChips(chips)}
      </ha-card>`;
    }

    const controls = this.shownControls;
    const group = (g: ControlGroup) =>
      CONTROL_KEYS.filter((k) => CONTROLS[k].group === g && controls.includes(k)).map((k) => this.renderTile(k));
    const tiles = (g: ControlGroup) => {
      const list = group(g);
      return list.length ? html`<div class="tiles">${list}</div>` : nothing;
    };
    const section = (g: Exclude<ControlGroup, "climate">) => {
      const list = group(g);
      return list.length
        ? html`<div class="section">
            <yvz-section-title>${t(`tesla.group.${g}` as TranslationKey)}</yvz-section-title>
            <div class="tiles">${list}</div>
          </div>`
        : nothing;
    };

    return html`
      <ha-card data-state=${role ?? nothing}>
        ${header}
        <div class="view ${this.switched ? (settings ? "from-end" : "from-start") : ""}">
          ${settings
            ? this.renderSettings()
            : html`<div class="grid ${drive ? "driving" : ""}">
                <div class="col">
                  <div class="hero">${carWrap} ${stats}</div>
                  ${this.renderBattery(charging)} ${this.renderChips(chips)} ${drive ? nothing : this.renderLimit()}
                </div>
                ${drive
                  ? nothing
                  : html`<div class="col">
                      ${this.renderClimate(tiles("climate"))}
                      ${CONTROL_GROUPS.filter((g) => g !== "climate").map((g) => section(g as Exclude<ControlGroup, "climate">))}
                    </div>`}
              </div>`}
        </div>
      </ha-card>
    `;
  }

  static override styles: CSSResultGroup = [
    YvzCard.styles,
    viewSwapStyles,
    carStyles,
    css`
      ha-card {
        container-type: inline-size;
      }

      .empty {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-2);
        margin: 0;
        color: var(--yvz-text-muted);
      }

      ha-icon {
        --mdc-icon-size: 16px;
      }

      /* one line at a fixed height; extra chips scroll sideways instead of adding a row */
      .chips {
        display: flex;
        gap: var(--yvz-space-2);
        min-height: 24px;
        overflow-x: auto;
        scrollbar-width: none;
      }

      .chips::-webkit-scrollbar {
        display: none;
      }

      .chips yvz-chip {
        flex: none;
      }

      .compact > .chips {
        margin-top: var(--yvz-space-3);
      }

      yvz-chip.tap,
      .stats,
      .bar,
      .charge,
      .climate-info,
      .car-wrap.wakeable {
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .grid {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-4);
        margin-top: var(--yvz-space-3);
      }

      .col {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-3);
        min-width: 0;
      }

      .hero {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-3);
      }

      /* room above the car for the lids, heat and the sleeping z's */
      .car-wrap {
        padding-top: var(--yvz-space-4);
        position: relative;
        flex: 1 1 auto;
        min-width: 0;
      }

      .hint {
        position: absolute;
        bottom: -2px;
        left: 50%;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-caption);
        white-space: nowrap;
        transform: translateX(-50%);
      }

      .overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--yvz-space-2);
        border-radius: var(--yvz-radius-md);
        background: var(--yvz-error-soft);
        color: var(--yvz-error-text);
        font-size: var(--yvz-text-body);
        font-weight: var(--yvz-weight-strong);
      }

      .stats {
        flex: none;
        text-align: end;
      }

      .pct {
        font-size: var(--yvz-text-display);
        font-variant-numeric: tabular-nums;
        font-weight: var(--yvz-weight-strong);
        line-height: 1;
      }

      .pct span {
        margin-inline-start: 2px;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-value);
        font-weight: var(--yvz-weight-medium);
      }

      .range {
        margin-top: var(--yvz-space-1);
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-title);
        font-variant-numeric: tabular-nums;
      }

      .battery {
        cursor: pointer;
      }

      .section {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-2);
      }

      .power {
        --yvz-segmented-height: 36px;
      }

      yvz-stepper {
        width: 168px;
      }

      yvz-stepper .value,
      .slider .value {
        color: var(--yvz-text);
        font-variant-numeric: tabular-nums;
        font-weight: var(--yvz-weight-medium);
      }

      .slider {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-2);
        width: 168px;
      }

      .slider yvz-slider {
        flex: 1;
      }

      .slider .value {
        min-width: 36px;
        text-align: end;
      }

      .banners {
        margin-top: var(--yvz-space-3);
      }

      .settings {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-4);
        margin-top: var(--yvz-space-4);
      }

      .hint {
        margin: 0;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        line-height: var(--yvz-line-label);
      }

      /* a group with fewer tiles than columns stretches them across the row instead of leaving holes */
      .tiles {
        --_cols: 4;
        display: grid;
        grid-template-columns: repeat(
          auto-fit,
          minmax(calc((100% - (var(--_cols) - 1) * var(--yvz-space-2)) / var(--_cols) - 1px), 1fr)
        );
        gap: var(--yvz-space-2);
        --yvz-tile-height: 60px;
        --yvz-tile-padding: var(--yvz-space-2) var(--yvz-space-3);
        --yvz-tile-value-size: var(--yvz-text-label);
        --yvz-tile-value-line: var(--yvz-line-label);
      }

      /* compact: status only; car on the left, battery on the right, one column when narrow */
      .glance {
        display: grid;
        grid-template-columns: minmax(0, 38%) minmax(0, 1fr);
        gap: var(--yvz-space-4);
        align-items: center;
        margin-top: var(--yvz-space-3);
      }

      .side {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-2);
        min-width: 0;
      }

      .compact .car {
        --tesla-car-height: 64px;
      }

      .compact .stats {
        display: flex;
        align-items: baseline;
        gap: var(--yvz-space-3);
        text-align: start;
      }

      .compact .pct {
        font-size: 32px;
      }

      .compact .range {
        margin: 0;
        font-size: var(--yvz-text-body);
      }

      @container (max-width: 359px) {
        .glance {
          grid-template-columns: 1fr;
        }
      }

      @container (min-width: 480px) {
        ha-card:not(.compact) .car {
          --tesla-car-height: 130px;
        }

        ha-card:not(.compact) .pct {
          font-size: 52px;
        }

        .tiles {
          --_cols: 6;
        }
      }

      @container (min-width: 760px) {
        .grid:not(.driving) {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
          gap: var(--yvz-space-6);
          align-items: start;
        }

        ha-card:not(.compact) .hero {
          flex-direction: column;
          align-items: stretch;
          gap: var(--yvz-space-2);
        }

        ha-card:not(.compact) .car {
          --tesla-car-height: 190px;
        }

        ha-card:not(.compact) .stats {
          display: flex;
          align-items: baseline;
          gap: var(--yvz-space-4);
          text-align: start;
        }

        ha-card:not(.compact) .pct {
          font-size: 56px;
        }

        ha-card:not(.compact) .range {
          margin: 0;
          font-size: var(--yvz-text-value);
        }

        .tiles {
          --_cols: 4;
        }
      }
    `,
  ];
}

registerCard({
  type: "yvz-tesla-card",
  name: "YVZ Tesla",
  description: "Tesla status: battery, range and charging, climate, charge limit and car controls.",
});

declare global {
  interface HTMLElementTagNameMap {
    "yvz-tesla-card": YvzTeslaCard;
  }
}
