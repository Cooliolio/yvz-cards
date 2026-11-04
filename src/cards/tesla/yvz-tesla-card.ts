import { css, html, nothing, unsafeCSS, type CSSResultGroup, type PropertyValues, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import "../../design";
import type { SegmentOption, TileBadge, YvzState } from "../../design";
import { formatDuration, formatNumber, formatTime } from "../../shared/format";
import type { TranslationKey } from "../../shared/i18n";
import { haptic } from "../../shared/haptic";
import { fireMoreInfo } from "../../shared/more-info";
import { registerCard } from "../../shared/register-card";
import { reducedMotion } from "../../design/tween";
import { animateHeight, viewSwapStyles } from "../../design/view-swap";
import { TickController } from "../../shared/tick-controller";
import type { HassEntity, HomeAssistant, LovelaceCardConfig } from "../../shared/types";
import { YvzCard } from "../../shared/yvz-card";
import { carStyles, hexToRgb, renderCar } from "./car";
import { CommandTracker, type CommandPhase } from "./commands";
import { RefreshSchedule, REFRESH_OFFSETS, WAKE_OFFSETS } from "./refresh";
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
  type ConfirmMode,
  type ControlGroup,
  type ControlKey,
  type ControlVerb,
  type TeslaCardConfig,
  type TeslaEntityKey,
} from "./types";

const LEVELS = ["off", "low", "medium", "high"];
const NO_VALUE = ["unknown", "unavailable", undefined, null, ""];
// Tap mode: the second tap has to come within this.
const ARM_MS = 4000;
// The confirm bar cancels itself (visibly) after this.
const CONFIRM_MS = 30_000;
// "Cancelled" stays this long.
const CANCELLED_MS = 2500;
// While a command is out the relative times and the notice are refreshed this often.
const LIVE_TICK_MS = 10_000;
// Entities whose change tells us the car reported something new.
const DATA_KEYS: TeslaEntityKey[] = ["battery", "range", "lock", "charging", "inside_temp", "location", "charge_limit"];
const TEMP_DEBOUNCE_MS = 900;
// How long an optimistic value wins over HA's state after it was sent.
const HOLD_MS = 2500;
const TEMP_HOLD_MS = 15_000;
const FLASH_MS = 2200;
// A gear or speed reading older than this no longer counts as driving.
const DRIVING_FRESH_MS = 5 * 60_000;
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
  // Tap mode: the control that waits for its confirming second tap.
  @state() private armed?: ControlKey;
  // Bar mode: the control whose question is open, and what its state was when it opened.
  @state() private confirming?: { key: ControlKey; verb: ControlVerb; from: string };
  // The control whose confirmation just ended without being sent.
  @state() private cancelled?: ControlKey;
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
  private confirmTimer?: ReturnType<typeof setTimeout>;
  private cancelledTimer?: ReturnType<typeof setTimeout>;
  private liveTimer?: ReturnType<typeof setInterval>;
  private tracker = new CommandTracker(() => {
    this.requestUpdate();
    this.syncLive();
  });
  private schedule = new RefreshSchedule({
    poll: () => this.pollCar(),
    settled: (since) => this.carSettled(since),
    now: () => Date.now(),
  });

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
    this.closeConfirm();
    this.pendingTemp = undefined;
  }

  override getCardSize(): number {
    return this.config?.compact ? 3 : 8;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const timer of [this.armTimer, this.tempTimer, this.limitTimer, this.flashTimer, this.confirmTimer, this.cancelledTimer]) {
      clearTimeout(timer);
    }
    clearInterval(this.liveTimer);
    this.liveTimer = undefined;
    this.tracker.dispose();
    this.schedule.cancel();
    this.confirming = undefined;
    this.armed = undefined;
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (!this.config || !this.hass) return;
    this.blinkOnLockChange();
    this.dropStaleConfirm();
    if (!changed.has("config") && !changed.has("hass")) return;
    const registry = this.hass.entities;
    if (this.resolvedFor?.config === this.config && this.resolvedFor.registry === registry) return;
    this.resolved = resolveEntities(this.config, this.hass);
    this.resolvedFor = { config: this.config, registry };
  }

  protected override updated(changed: PropertyValues): void {
    if (!changed.has("confirming") || !this.confirming) return;
    // A bar below the fold is a tap that seems to do nothing: bring it into view and put focus on the safe choice.
    const bar = this.renderRoot.querySelector<HTMLElement>(".confirm");
    bar?.scrollIntoView?.({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    bar?.querySelector<HTMLButtonElement>(".cancel")?.focus({ preventScroll: true });
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
    this.closeConfirm();
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

  // Driving needs a gear and a recent reading: a car that last said "D" an hour ago is parked now.
  private get driving(): boolean {
    if (this.noData || this.asleep) return false;
    const shift = String(this.st("shift")?.state ?? "").toLowerCase();
    if (!["d", "r", "n"].includes(shift)) return false;
    return (["shift", "speed"] as const).some((key) => {
      const st = this.st(key);
      const at = Date.parse(st?.last_reported ?? st?.last_updated ?? "");
      return Number.isFinite(at) && Date.now() - at <= DRIVING_FRESH_MS;
    });
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

  // Sends a command and follows it: Sending, then Done or the reason it failed, and asks HA for fresh data.
  private call(domain: string, service: string, key: TeslaEntityKey, data: Record<string, unknown> = {}, id: string = key): void {
    const entity_id = this.resolved.entities[key];
    const hass = this.hass;
    if (!entity_id || !hass) return;
    const isWake = domain === "button" && key === "wake";
    // A sleeping car is woken by the command itself, which is why it can take a while.
    const waking = !isWake && (this.asleep || this.noData);
    const refresh = this.config?.refresh_after_command !== false;
    void this.tracker.run(id, () => Promise.resolve(hass.callService(domain, service, { entity_id, ...data })), waking).then((ok) => {
      if (ok && refresh && this.isConnected) this.schedule.afterAnswer();
    });
    if (refresh) {
      this.schedule.start(isWake ? WAKE_OFFSETS : REFRESH_OFFSETS);
      this.syncLive();
    }
  }

  // Ask HA to fetch the car again: the status and one data entity.
  private pollCar(): void {
    const entity_id = (["status", "battery"] as const).map((k) => this.resolved.entities[k]).filter(Boolean);
    if (!entity_id.length || !this.hass) return;
    void Promise.resolve(this.hass.callService("homeassistant", "update_entity", { entity_id })).catch(() => {});
  }

  // Enough news to stop asking: the car is online and something it reports changed since the press.
  // (last_reported alone is not trusted: it may not move on a status-only poll.)
  private carSettled(since: number): boolean {
    if (!this.on("status")) return false;
    return DATA_KEYS.some((key) => {
      const st = this.st(key);
      return [st?.last_updated, st?.last_reported].some((at) => Date.parse(at ?? "") > since);
    });
  }

  // Relative times and the notice keep up while a command is out.
  private syncLive(): void {
    const needed = this.tracker.anyBusy || this.schedule.active;
    if (needed && !this.liveTimer) {
      this.liveTimer = setInterval(() => {
        this.requestUpdate();
        this.syncLive();
      }, LIVE_TICK_MS);
    } else if (!needed && this.liveTimer) {
      clearInterval(this.liveTimer);
      this.liveTimer = undefined;
    }
  }

  private get confirmMode(): ConfirmMode {
    const mode = this.config?.confirm;
    return mode === "tap" || mode === "none" ? mode : "bar";
  }

  private verbOf(key: ControlKey, st: HassEntity): ControlVerb {
    const kind: string = CONTROLS[key].kind;
    if (kind === "lock") return st.state === "locked" ? "unlock" : "lock";
    if (kind === "cover") return st.state === "open" ? "close" : "open";
    return "open";
  }

  private needsConfirm(key: ControlKey, st: HassEntity): boolean {
    const def = CONTROLS[key];
    const rule = "confirm" in def ? def.confirm : undefined;
    return rule === "always" || (rule === "unlock" && st.state === "locked");
  }

  /* ---------- confirming ---------- */

  // Tap mode: first tap arms, second tap (within ARM_MS) goes. An armed tile that is left alone says so.
  private arm(key: ControlKey): boolean {
    clearTimeout(this.armTimer);
    if (this.armed === key) {
      this.armed = undefined;
      return true;
    }
    haptic("warning");
    this.armed = key;
    this.armTimer = setTimeout(() => {
      this.armed = undefined;
      this.showCancelled(key);
    }, ARM_MS);
    return false;
  }

  // Bar mode: the question stays until it is answered, or 30 s pass and it says "Cancelled".
  private openConfirm(key: ControlKey, verb: ControlVerb, from: string): void {
    if (this.confirming?.key === key) {
      this.cancelConfirm(true);
      return;
    }
    clearTimeout(this.confirmTimer);
    haptic("warning");
    this.cancelled = undefined;
    this.confirming = { key, verb, from };
    this.confirmTimer = setTimeout(() => this.cancelConfirm(false), CONFIRM_MS);
  }

  // Closes the bar without sending and says so. `byUser` returns focus to the tile for keyboard users.
  private cancelConfirm(byUser: boolean): void {
    const open = this.confirming;
    if (!open) return;
    this.closeConfirm();
    this.showCancelled(open.key);
    if (byUser) this.focusTile(open.key);
  }

  // Closes without a word, for when the card is reconfigured or left.
  private closeConfirm(): void {
    clearTimeout(this.confirmTimer);
    this.confirming = undefined;
  }

  // The car changed under an open question (already open, went unavailable): it no longer applies.
  private dropStaleConfirm(): void {
    const open = this.confirming;
    if (!open) return;
    const st = this.st(open.key);
    if (!st || st.state !== open.from) this.cancelConfirm(false);
  }

  private showCancelled(key: ControlKey): void {
    this.cancelled = key;
    clearTimeout(this.cancelledTimer);
    this.cancelledTimer = setTimeout(() => (this.cancelled = undefined), CANCELLED_MS);
  }

  private focusTile(key: ControlKey): void {
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector<HTMLElement>(`yvz-tile[data-key="${key}"]`)?.shadowRoot?.querySelector("button")?.focus();
    });
  }

  private confirmNow(): void {
    const open = this.confirming;
    if (!open) return;
    this.closeConfirm();
    this.focusTile(open.key);
    this.send(open.key);
  }

  private onBarKey(e: KeyboardEvent): void {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    this.cancelConfirm(true);
  }

  private onControl(key: ControlKey): void {
    const def = CONTROLS[key];
    const st = this.st(key);
    if (!st) return;
    const kind: string = def.kind;
    if (st.state === "unavailable" || (kind !== "button" && NO_VALUE.includes(st.state))) return;
    if (kind !== "button" && this.noData) return;
    if (kind === "open_only" && st.state === "open") return; // the frunk can't be closed remotely
    // A second press while the first is still out would send the command twice.
    if (this.tracker.isBusy(key)) return;
    if (this.needsConfirm(key, st) && this.confirmMode !== "none") {
      if (this.confirmMode === "bar") {
        this.openConfirm(key, this.verbOf(key, st), st.state);
        return;
      }
      if (!this.arm(key)) return;
    }
    this.send(key);
  }

  private send(key: ControlKey): void {
    const def = CONTROLS[key];
    const st = this.st(key);
    if (!st) return;
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

  // One tap: waking is harmless, and the notice shows what happens.
  private onCar(): void {
    if (!(this.asleep || this.noData) || !this.has("wake") || this.tracker.isBusy("wake")) return;
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
    if (this.stale) chips.push({ state: "pending", icon: "mdi:clock-alert-outline", text: t("tesla.stale_chip"), more: "battery" });

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
    let attention = false;
    let busy = false;
    let countdown = 0;

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

    // What the tile says while it asks, sends or reports back; the tone is a soft fill, never white on red.
    const say = (text: string) => {
      selected = false;
      warn = false;
      steps = 0;
      value = text;
      valueText = text;
    };
    if (this.confirming?.key === key) {
      say(t("tesla.confirm.below"));
      attention = true;
      tone = "error";
    }
    if (this.armed === key) {
      say(t(`tesla.tap_again.${this.verbOf(key, st)}` as TranslationKey));
      attention = true;
      tone = "error";
      countdown = ARM_MS;
    }
    if (unavailable) {
      selected = false;
      warn = false;
      steps = 0;
      value = this.noData ? t("common.no_data") : this.asleep ? t("tesla.asleep") : t("common.unavailable");
    }

    const cmd = this.tracker.get(key);
    let icon2: string | undefined;
    if (cmd) {
      say(t(`tesla.cmd.value.${cmd.phase}` as TranslationKey));
      tone = undefined;
      attention = cmd.phase === "done" || cmd.phase === "failed" || cmd.phase === "slow";
      busy = cmd.phase === "sending" || cmd.phase === "waking" || cmd.phase === "slow";
      countdown = 0;
      if (cmd.phase === "done") tone = "on";
      if (cmd.phase === "failed") tone = "error";
      if (cmd.phase === "slow") tone = "pending";
      icon2 = busy ? "mdi:loading" : cmd.phase === "done" ? "mdi:check" : "mdi:alert-circle-outline";
    }

    const badges: TileBadge[] = [{ icon: icon2 ?? icon, state: warn ? "pending" : undefined }];
    return html`<yvz-tile
      outline
      data-key=${key}
      data-state=${tone ?? nothing}
      .label=${t(`tesla.control.${key}` as TranslationKey)}
      .value=${value}
      .steps=${steps}
      .level=${level}
      .valueText=${valueText}
      .badges=${badges}
      .countdown=${countdown}
      ?selected=${selected}
      ?attention=${attention}
      ?busy=${busy}
      ?disabled=${unavailable && !cmd}
      @click=${() => this.onControl(key)}
    ></yvz-tile>`;
  }

  /* ---------- confirm bar, notice, live regions ---------- */

  private commandName(id: string): string {
    const t = this.t;
    if (id === "climate") return t("tesla.section_climate");
    if (id === "charge_limit") return t("tesla.charge_limit");
    return id in CONTROLS ? t(`tesla.control.${id as ControlKey}` as TranslationKey) : id;
  }

  // What the latest command (or a cancelled question) has to say, as text for the notice and screen readers.
  private message(): { text: string; phase: CommandPhase | "cancelled"; slot: ControlGroup | "top" } | undefined {
    const t = this.t;
    const latest = this.tracker.latest;
    if (latest) {
      const { id, state } = latest;
      const name = this.commandName(id);
      const text =
        state.phase === "failed"
          ? state.reason
            ? t("tesla.cmd.failed_reason", { name, reason: state.reason })
            : t("tesla.cmd.failed", { name })
          : t(`tesla.cmd.${state.phase}` as TranslationKey, { name });
      const def = id in CONTROLS ? CONTROLS[id as ControlKey] : undefined;
      const inGroup = !!def && this.shownControls.includes(id as ControlKey) && !!this.st(id as ControlKey);
      return { text, phase: state.phase, slot: inGroup ? def.group : "top" };
    }
    if (this.cancelled) {
      return { text: `${this.commandName(this.cancelled)}: ${t("tesla.cancelled")}`, phase: "cancelled", slot: CONTROLS[this.cancelled].group };
    }
    return undefined;
  }

  // Shown where the press happened (under its group's tiles), or under the battery for the rest.
  private renderNotice(slot: ControlGroup | "top"): TemplateResult | typeof nothing {
    const msg = this.message();
    if (!msg || msg.slot !== slot) return nothing;
    const tone: Record<string, YvzState | undefined> = {
      sending: "off",
      waking: "off",
      slow: "pending",
      done: "on",
      failed: "error",
      cancelled: "off",
    };
    const icon: Record<string, string> = {
      sending: "mdi:loading",
      waking: "mdi:loading",
      slow: "mdi:clock-alert-outline",
      done: "mdi:check",
      failed: "mdi:alert-circle-outline",
      cancelled: "mdi:close-circle-outline",
    };
    return html`<div class="notice ${msg.phase}" data-state=${tone[msg.phase] ?? nothing} aria-hidden="true">
      <ha-icon icon=${icon[msg.phase]}></ha-icon><span>${msg.text}</span>
    </div>`;
  }

  // The question for the open control, under the tiles of its group. It stays until it is answered.
  private renderConfirmBar(group: ControlGroup): TemplateResult | typeof nothing {
    const open = this.confirming;
    if (!open || CONTROLS[open.key].group !== group) return nothing;
    const t = this.t;
    return html`<div class="confirm" role="group" aria-labelledby="confirm-q" aria-describedby="confirm-d" data-state="error" @keydown=${this.onBarKey}>
      <span id="confirm-q" class="question">${t(`tesla.ask.${open.key}.${open.verb}` as TranslationKey)}</span>
      <span class="actions">
        <button type="button" class="cancel" @click=${() => this.cancelConfirm(true)}>${t("tesla.confirm.cancel")}</button>
        <button type="button" class="go" @click=${this.confirmNow}>${t(`tesla.act.${open.verb}` as TranslationKey)}</button>
      </span>
      <span id="confirm-d" class="sr-only">${t("tesla.confirm.expires")}</span>
      <span class="drain" aria-hidden="true"></span>
    </div>`;
  }

  // Screen readers get Sending/Done politely and a failure as an alert. The regions stay in the page so the
  // text change is announced.
  private renderLive(): TemplateResult {
    const msg = this.message();
    const failed = msg?.phase === "failed";
    return html`<div class="sr-only" role="status" aria-live="polite">${msg && !failed ? msg.text : ""}</div>
      <div class="sr-only" role="alert">${failed ? msg.text : ""}</div>`;
  }

  // The tiles of a group, followed by the question or the result for that group.
  private groupGrid(g: ControlGroup): TemplateResult | typeof nothing {
    const keys = CONTROL_KEYS.filter((k) => CONTROLS[k].group === g && this.shownControls.includes(k));
    if (!keys.length) return nothing;
    return html`<div class="tiles">${keys.map((k) => this.renderTile(k))}${this.renderConfirmBar(g)}${this.renderNotice(g)}</div>`;
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
    const wakeCmd = this.tracker.get("wake");
    const carWrap = html`<div
      class="car-wrap ${carWake ? "wakeable" : ""}"
      role=${carWake ? "button" : nothing}
      tabindex=${carWake ? 0 : nothing}
      @click=${compact ? nothing : this.onCar}
      @keydown=${carWake ? this.key(() => this.onCar()) : nothing}
    >
      ${car}
      ${wakeCmd
        ? html`<div class="hint">${t(`tesla.cmd.value.${wakeCmd.phase}` as TranslationKey)}</div>`
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

    const section = (g: Exclude<ControlGroup, "climate">) => {
      const grid = this.groupGrid(g);
      return grid === nothing
        ? nothing
        : html`<div class="section">
            <yvz-section-title>${t(`tesla.group.${g}` as TranslationKey)}</yvz-section-title>
            ${grid}
          </div>`;
    };
    const hasControls = this.shownControls.some((k) => !!this.st(k));

    return html`
      <ha-card data-state=${role ?? nothing}>
        ${header}
        <div class="view ${this.switched ? (settings ? "from-end" : "from-start") : ""}">
          ${settings
            ? this.renderSettings()
            : html`<div class="grid ${drive ? "driving" : ""}">
                <div class="col">
                  <div class="hero">${carWrap} ${stats}</div>
                  ${this.renderBattery(charging)} ${this.renderChips(chips)} ${this.renderNotice("top")} ${drive ? nothing : this.renderLimit()}
                </div>
                ${drive
                  ? nothing
                  : html`<div class="col">
                      ${this.asleep && hasControls ? html`<p class="sleep-note">${t("tesla.asleep_hint")}</p>` : nothing}
                      ${this.renderClimate(this.groupGrid("climate"))}
                      ${CONTROL_GROUPS.filter((g) => g !== "climate").map((g) => section(g as Exclude<ControlGroup, "climate">))}
                    </div>`}
              </div>`}
        </div>
        ${this.renderLive()}
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

      /* extra height goes to the car area, which keeps the car centred */
      .view {
        display: flex;
        flex: 1;
        flex-direction: column;
      }

      .grid {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: var(--yvz-space-4);
        margin-top: var(--yvz-space-3);
      }

      .col:first-child {
        flex: 1;
      }

      /* car, battery and chips stay together, centred in the extra height */
      .col:first-child {
        justify-content: center;
      }

      /* driving: one centred block (car and speed side by side, battery below), not stretched */
      .grid.driving {
        align-items: center;
        justify-content: center;
      }

      .grid.driving .col {
        justify-content: center;
        width: 100%;
        max-width: 760px;
      }

      .grid.driving .col:first-child {
        flex: 0 1 auto;
      }

      .grid.driving .hero {
        flex: 0 0 auto;
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

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }

      .sleep-note {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-2);
        margin: 0;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        line-height: var(--yvz-line-label);
      }

      /* the question under the tiles: soft error fill, a 2px ring and the tinted text, never white on red */
      .confirm {
        grid-column: 1 / -1;
        position: relative;
        overflow: hidden;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--yvz-space-2) var(--yvz-space-3);
        padding: var(--yvz-space-3);
        border-radius: var(--yvz-radius-md);
        background: var(--yvz-state-soft);
        box-shadow: inset 0 0 0 2px var(--yvz-state-text);
        color: var(--yvz-state-text);
        /* room for a sticky header or the bottom bar when it is scrolled into view */
        scroll-margin-block: 72px;
      }

      .confirm .question {
        flex: 1 1 auto;
        font-size: var(--yvz-text-body);
        font-weight: var(--yvz-weight-strong);
      }

      .confirm .actions {
        display: flex;
        gap: var(--yvz-space-2);
        margin-inline-start: auto;
      }

      .confirm button {
        min-width: 88px;
        min-height: 44px;
        padding: 0 var(--yvz-space-4);
        border: 2px solid var(--yvz-state-text);
        border-radius: var(--yvz-radius-md);
        background: var(--yvz-surface);
        color: var(--yvz-text);
        font: inherit;
        font-weight: var(--yvz-weight-medium);
        cursor: pointer;
      }

      .confirm button.cancel {
        border-color: color-mix(in srgb, var(--yvz-text) 60%, transparent);
      }

      .confirm button.go {
        color: var(--yvz-state-text);
      }

      .confirm button:hover {
        background: color-mix(in srgb, var(--yvz-surface) 88%, var(--yvz-text));
      }

      .confirm .drain {
        position: absolute;
        inset: auto 0 0 0;
        height: 3px;
        background: var(--yvz-state-text);
        transform-origin: left;
        animation: drain ${unsafeCSS(CONFIRM_MS)}ms linear forwards;
      }

      @keyframes drain {
        from {
          transform: scaleX(1);
        }
        to {
          transform: scaleX(0);
        }
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      /* the result of the last press, next to the tiles it came from */
      .notice {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: var(--yvz-space-2);
        padding: var(--yvz-space-2) var(--yvz-space-3);
        border-radius: var(--yvz-radius-md);
        background: var(--yvz-state-soft);
        color: var(--yvz-state-text);
        font-size: var(--yvz-text-label);
        font-weight: var(--yvz-weight-medium);
        line-height: var(--yvz-line-label);
      }

      .notice ha-icon {
        flex: none;
        color: inherit;
      }

      .notice.sending ha-icon,
      .notice.waking ha-icon,
      .notice.slow ha-icon {
        animation: spin 1.2s linear infinite;
      }

      .notice.slow ha-icon {
        animation: none;
      }

      @media (prefers-reduced-motion: reduce) {
        .confirm .drain,
        .notice ha-icon {
          animation: none;
        }

        .confirm .drain {
          display: none;
        }
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
        /* an unavailable or asleep tile keeps its text readable instead of fading out */
        --yvz-tile-disabled-opacity: 1;
        --yvz-tile-disabled-color: var(--yvz-text-muted);
      }

      /* compact: status only; car on the left, battery on the right, one column when narrow */
      .glance {
        display: grid;
        flex: 1;
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

      /* four tiles across need about 430px; below that two across keeps the labels readable */
      @container (max-width: 429px) {
        .tiles {
          --_cols: 2;
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
        }

        .grid:not(.driving) .col:last-child {
          align-self: center;
        }

        ha-card:not(.compact) .grid:not(.driving) .hero {
          flex-direction: column;
          align-items: stretch;
          gap: var(--yvz-space-2);
        }

        ha-card:not(.compact) .grid:not(.driving) .car-wrap {
          flex: none;
        }

        ha-card:not(.compact) .car {
          --tesla-car-height: 190px;
        }

        ha-card:not(.compact) .grid:not(.driving) .stats {
          display: flex;
          align-items: baseline;
          gap: var(--yvz-space-4);
          text-align: start;
        }

        ha-card:not(.compact) .pct {
          font-size: 56px;
        }

        ha-card:not(.compact) .grid.driving .pct {
          font-size: 72px;
        }

        ha-card:not(.compact) .grid:not(.driving) .range {
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
