import { css, html, nothing, type CSSResultGroup, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import "../../design";
import type { NoteTone, YvzState } from "../../design";
import { runAction, triggerEntity } from "../../shared/actions";
import { formatDuration, formatNumber, formatTime } from "../../shared/format";
import { haptic } from "../../shared/haptic";
import { fetchSamples } from "../../shared/history";
import type { TranslationKey } from "../../shared/i18n";
import { fireMoreInfo } from "../../shared/more-info";
import { registerCard } from "../../shared/register-card";
import { TickController } from "../../shared/tick-controller";
import type { HassEntity, HomeAssistant, LovelaceCardConfig } from "../../shared/types";
import { YvzCard } from "../../shared/yvz-card";
import { analyse, minutes, segmentsOf, type RunInfo } from "./runs";
import "./yvz-stove-card-editor";
import {
  DEFAULT_IGNITION_MIN,
  DEFAULT_PELLET_HOURS,
  DEFAULT_POWER_THRESHOLD,
  NEAR_ZERO_WATTS,
  SLOW_IGNITION_FACTOR,
  type StoveAction,
  type StoveCardConfig,
} from "./types";

const UNAVAILABLE = ["unavailable", "unknown"];
const DEFAULT_ROLES: Record<string, YvzState> = { on: "on", off: "off" };
// The first tap on a burning stove arms the button; it disarms again after this long.
const ARM_MS = 3000;
// How long "Warmer verstuurd" stays in the status line.
const SENT_MS = 3000;
// A second press of the same button inside this window is ignored, so a double tap can't send two steps.
const LOCK_MS = 1000;
const HISTORY_MS = 48 * 3_600_000;
const REFRESH_MS = 5 * 60_000;
// A mismatch between status and wattage only counts once it has lasted this long.
const MISMATCH_MS = 5 * 60_000;
const MISMATCH_CHECK_MS = 30_000;

interface Sent {
  key: StoveAction;
  failed: boolean;
}

@customElement("yvz-stove-card")
export class YvzStoveCard extends YvzCard<StoveCardConfig> {
  @state() private armed = false;
  @state() private sent?: Sent;
  @state() private runs?: RunInfo;
  @state() private mismatch = false;

  private armTimer?: ReturnType<typeof setTimeout>;
  private sentTimer?: ReturnType<typeof setTimeout>;
  private lastSent: Partial<Record<StoveAction, number>> = {};
  private loadedFor = "";
  private fetchedAt = 0;
  private loading = false;
  private checkedAt = 0;
  private checking = false;

  constructor() {
    super();
    new TickController(this, 30_000);
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("yvz-stove-card-editor");
  }

  static getStubConfig(hass: HomeAssistant): Partial<StoveCardConfig> {
    const temperature = Object.values(hass.states).find(
      (s) => s.entity_id.startsWith("sensor.") && s.attributes.device_class === "temperature",
    )?.entity_id;
    return temperature ? { temperature } : {};
  }

  setConfig(config: LovelaceCardConfig): void {
    if (!config || typeof config !== "object") throw new Error("yvz-stove-card: invalid configuration");
    this.config = config as StoveCardConfig;
    this.runs = undefined;
    this.loadedFor = "";
  }

  override getCardSize(): number {
    return this.config?.compact ? 1 : 3;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.armTimer);
    clearTimeout(this.sentTimer);
  }

  /* ---------- state ---------- */

  private statusEntity(): HassEntity | undefined {
    const id = this.config?.status;
    const entity = id ? this.hass?.states[id] : undefined;
    return entity && !UNAVAILABLE.includes(entity.state) ? entity : undefined;
  }

  private roleOfState(state: string): YvzState {
    if (UNAVAILABLE.includes(state)) return "unavailable";
    return this.config?.state_map?.[state] ?? DEFAULT_ROLES[state.toLowerCase()] ?? "accent";
  }

  private stateRole(entity: HassEntity | undefined): YvzState {
    if (!this.config?.status) return "accent";
    if (!entity) return "unavailable";
    return this.roleOfState(entity.state);
  }

  private number(id: string | undefined): number | undefined {
    const n = id ? parseFloat(this.hass?.states[id]?.state ?? "") : NaN;
    return Number.isNaN(n) ? undefined : n;
  }

  /* ---------- history ---------- */

  protected override willUpdate(): void {
    if (!this.config || !this.hass) return;
    const status = this.statusEntity();
    const role = this.stateRole(status);

    // The ignition lines come from the status history; refetch when the status changes or now and then.
    if (this.config.status && status && !this.loading) {
      const key = `${this.config.status}|${status.last_changed}`;
      if (key !== this.loadedFor || Date.now() - this.fetchedAt > REFRESH_MS) void this.loadRuns(key);
    }

    // Status and wattage disagreeing is only worth a hint once it has lasted a while, so ask the history.
    const watts = this.number(this.config.power_sensor);
    const suspicious = watts !== undefined && this.suspicious(role, watts);
    const settled = status !== undefined && Date.now() - Date.parse(status.last_changed) >= MISMATCH_MS;
    if (!suspicious || !settled) {
      this.mismatch = false;
      return;
    }
    if (!this.checking && Date.now() - this.checkedAt > MISMATCH_CHECK_MS) void this.confirmMismatch(role);
  }

  private suspicious(role: YvzState, watts: number): boolean {
    if (role === "off") return watts > (this.config?.power_threshold ?? DEFAULT_POWER_THRESHOLD);
    if (role === "on") return watts < NEAR_ZERO_WATTS;
    return false;
  }

  private async loadRuns(key: string): Promise<void> {
    const hass = this.hass;
    const id = this.config?.status;
    if (!hass || !id) return;
    this.loading = true;
    this.loadedFor = key;
    this.fetchedAt = Date.now();
    try {
      const now = Date.now();
      const samples = (await fetchSamples(hass, [id], now - HISTORY_MS, now))[id] ?? [];
      this.runs = samples.length ? analyse(segmentsOf(samples, (s) => this.roleOfState(s), now)) : undefined;
    } finally {
      this.loading = false;
    }
  }

  private async confirmMismatch(role: YvzState): Promise<void> {
    const hass = this.hass;
    const id = this.config?.power_sensor;
    if (!hass || !id) return;
    this.checking = true;
    this.checkedAt = Date.now();
    try {
      const now = Date.now();
      const samples = (await fetchSamples(hass, [id], now - MISMATCH_MS - 60_000, now))[id] ?? [];
      const values = samples.map((s) => parseFloat(s.s)).filter((n) => !Number.isNaN(n));
      // The first sample is the reading at the start of the window, so the whole stretch is covered.
      const covered = samples.length > 0 && samples[0].t <= now - MISMATCH_MS;
      this.mismatch = covered && values.length > 0 && values.every((w) => this.suspicious(role, w));
    } finally {
      this.checking = false;
    }
  }

  /* ---------- actions ---------- */

  private lock(key: StoveAction): boolean {
    const now = Date.now();
    if (now - (this.lastSent[key] ?? 0) < LOCK_MS) return true;
    this.lastSent[key] = now;
    return false;
  }

  private disarm(): void {
    clearTimeout(this.armTimer);
    this.armed = false;
  }

  private async onPower(event: Event): Promise<void> {
    const entity = this.config?.actions?.power;
    if (!this.hass || !entity) return;
    const hass = this.hass;
    const role = this.stateRole(this.statusEntity());
    // A stove that is burning or starting up needs a second tap, so a stray touch can't put it out.
    if ((role === "on" || role === "pending") && !this.armed) {
      haptic("warning");
      this.armed = true;
      clearTimeout(this.armTimer);
      this.armTimer = setTimeout(() => (this.armed = false), ARM_MS);
      return;
    }
    this.disarm();
    if (this.lock("power")) return;
    haptic("medium");
    await runAction(event.currentTarget as HTMLElement & { status: "idle" }, () => triggerEntity(hass, entity));
  }

  private async onStep(event: Event, key: StoveAction): Promise<void> {
    const entity = this.config?.actions?.[key];
    if (!this.hass || !entity || this.lock(key)) return;
    const hass = this.hass;
    haptic("light");
    const ok = await runAction(event.currentTarget as HTMLElement & { status: "idle" }, () => triggerEntity(hass, entity));
    // The IR commands don't answer, so the status line is the only confirmation there is.
    this.sent = { key, failed: !ok };
    clearTimeout(this.sentTimer);
    this.sentTimer = setTimeout(() => (this.sent = undefined), SENT_MS);
  }

  /* ---------- text ---------- */

  private clock(at: number): string {
    const hass = this.hass!;
    const midnight = new Date().setHours(0, 0, 0, 0);
    if (at >= midnight) return formatTime(hass, at);
    const day = new Intl.DateTimeFormat(hass.locale?.language ?? hass.language, { weekday: "short" }).format(at);
    return `${day} ${formatTime(hass, at)}`;
  }

  private statusLine(status: HassEntity | undefined, role: YvzState): TemplateResult | string {
    const t = this.t;
    if (this.armed) return t("stove.armed_off");
    if (this.sent) {
      return this.sent.failed
        ? t("stove.send_failed")
        : html`<ha-icon icon="mdi:check"></ha-icon>${t(`stove.sent.${this.sent.key}` as TranslationKey)}`;
    }
    if (!status) return "";
    const text = this.hass!.formatEntityState?.(status) ?? status.state;
    if (role === "error") return this.runs?.failedIgnition ? `${text} · ${t("stove.failed_ignition")}` : text;
    if (role === "pending" || role === "on" || role === "standby") {
      return `${text} · ${formatDuration(t, Date.now() - Date.parse(status.last_changed))}`;
    }
    return text;
  }

  private trendText(role: YvzState): string {
    const burning = role === "on" || role === "pending";
    const id = burning ? this.config?.trend : role === "off" || role === "standby" ? this.config?.trend_off : undefined;
    const v = this.number(id);
    if (v === undefined) return "";
    // While off the helper holds how fast it cools, as a plain number; it is shown as a drop.
    const shown = burning ? v : -Math.abs(v);
    const text = new Intl.NumberFormat(this.hass!.locale?.language ?? this.hass!.language, {
      signDisplay: "exceptZero",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(shown);
    return `${text}${this.t("stove.per_hour")}`;
  }

  /* ---------- the line under the controls ---------- */

  private note(role: YvzState): { tone: NoteTone; icon: string; text: string; progress?: number } | undefined {
    const t = this.t;
    const watts = this.number(this.config?.power_sensor);
    if (this.mismatch && watts !== undefined) {
      return { tone: "info", icon: "mdi:help-circle-outline", text: t("stove.wrong_state", { watts: formatNumber(this.hass!, Math.round(watts)) }) };
    }
    const avg = this.number(this.config?.ignition_avg);
    const avgText = avg !== undefined && avg > 0 ? Math.round(avg) : undefined;

    if (role === "pending") {
      const status = this.statusEntity();
      const usual = avgText ?? DEFAULT_IGNITION_MIN;
      const elapsed = status ? (Date.now() - Date.parse(status.last_changed)) / 60_000 : 0;
      return { tone: "warning", icon: "mdi:timer-sand", text: t("stove.ignition_usually", { minutes: usual }), progress: elapsed / usual };
    }
    const runs = this.runs;
    if (!runs) return undefined;
    if (role === "on" && runs.ignitionMs !== undefined) {
      const took = minutes(runs.ignitionMs);
      if (avgText !== undefined && runs.ignitionMs > avgText * SLOW_IGNITION_FACTOR * 60_000) {
        return { tone: "warning", icon: "mdi:alert-outline", text: t("stove.ignition_slow", { minutes: took, avg: avgText }) };
      }
      return {
        tone: "neutral",
        icon: "mdi:fire",
        text: avgText === undefined ? t("stove.ignited_in", { minutes: took }) : t("stove.ignited_in_avg", { minutes: took, avg: avgText }),
      };
    }
    if (role === "error" && runs.failedIgnition) {
      const failures = this.number(this.config?.failures_today);
      const m = minutes(runs.failedIgnition.ms);
      return {
        tone: "error",
        icon: "mdi:fire-off",
        text: failures === undefined ? t("stove.no_fire", { minutes: m }) : t("stove.no_fire_count", { minutes: m, count: Math.round(failures) }),
      };
    }
    if (role === "off" && runs.lastOn) {
      const params = { from: this.clock(runs.lastOn.from), to: this.clock(runs.lastOn.to) };
      return {
        tone: "neutral",
        icon: "mdi:history",
        text:
          runs.ignitionMs === undefined
            ? t("stove.last_on", params)
            : t("stove.last_on_ignition", { ...params, minutes: minutes(runs.ignitionMs) }),
      };
    }
    return undefined;
  }

  private refillText(): string {
    const hours = this.number(this.config?.pellets_hours);
    if (hours === undefined || hours > (this.config?.pellets_threshold ?? DEFAULT_PELLET_HOURS)) return "";
    if (hours <= 0) return this.t("stove.refill_now");
    const time = hours < 1 ? this.t("common.minutes_short", { count: Math.round(hours * 60) }) : this.t("common.hours_short", { count: Math.round(hours) });
    return this.t("stove.refill_in", { time });
  }

  /* ---------- render ---------- */

  private renderStep(key: StoveAction, icon: string, label: string) {
    return html`<yvz-icon-button
      raised
      .icon=${icon}
      .label=${label}
      @click=${(e: Event) => this.onStep(e, key)}
    ></yvz-icon-button>`;
  }

  private renderRow(group: "temp" | "fan") {
    const actions = this.config?.actions;
    if (!actions?.[`${group}_up`] || !actions?.[`${group}_down`]) return nothing;
    const label = this.t(`stove.${group}`);
    return html`<div class="line">
      <span class="label"><ha-icon icon=${group === "temp" ? "mdi:thermometer" : "mdi:fan"}></ha-icon>${label}</span>
      ${this.renderStep(`${group}_down`, "mdi:minus", `${label}: ${this.t("common.decrease")}`)}
      ${this.renderStep(`${group}_up`, "mdi:plus", `${label}: ${this.t("common.increase")}`)}
    </div>`;
  }

  private renderTemperature(role: YvzState, small = false) {
    const id = this.config?.temperature;
    if (!id || !this.hass) return nothing;
    const n = this.number(id);
    const text = n === undefined ? "—" : `${formatNumber(this.hass, n, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`;
    const trend = small ? "" : this.trendText(role);
    return html`<button class="temp ${small ? "small" : ""}" @click=${() => fireMoreInfo(this, id)}>
      <b>${text}</b>${trend ? html`<small>${trend}</small>` : nothing}
    </button>`;
  }

  private renderPower(size: "md" | "sm", icon: string) {
    if (!this.config?.actions?.power) return nothing;
    return html`<yvz-power-button
      .size=${size}
      .icon=${icon}
      .label=${this.t("stove.power")}
      ?armed=${this.armed}
      @click=${this.onPower}
    ></yvz-power-button>`;
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    const t = this.t;
    const status = this.statusEntity();
    const role = this.stateRole(status);
    const name = this.config.name ?? t("stove.default_name");
    const line = this.statusLine(status, role);

    const head = html`<p class="name">${name}</p>
      <p class="status"><span class="dot"></span><span class="text">${line}</span></p>`;

    if (this.config.compact) {
      return html`<ha-card data-state=${role} class="compact">
        <div class="row">
          ${this.renderPower("sm", role === "on" ? "mdi:fire" : "mdi:power")}
          <div class="mid">${head}</div>
          ${this.renderTemperature(role, true)}
          ${this.config.actions?.temp_up && this.config.actions?.temp_down
            ? html`<div class="pair">
                ${this.renderStep("temp_down", "mdi:minus", `${t("stove.temp")}: ${t("common.decrease")}`)}
                ${this.renderStep("temp_up", "mdi:plus", `${t("stove.temp")}: ${t("common.increase")}`)}
              </div>`
            : nothing}
        </div>
      </ha-card>`;
    }

    const note = this.note(role);
    const refill = this.refillText();
    return html`<ha-card data-state=${role}>
      <div class="head">
        <div>${head}</div>
        ${this.renderTemperature(role)}
      </div>
      <div class="main">
        <div class="body">
          ${this.renderPower("md", "mdi:power")}
          <div class="controls">${this.renderRow("temp")}${this.renderRow("fan")}</div>
        </div>
        ${note
          ? html`<yvz-note .tone=${note.tone} .icon=${note.icon} .progress=${note.progress}>${note.text}</yvz-note>`
          : nothing}
        ${refill ? html`<div class="chips"><yvz-chip data-state="pending" icon="mdi:package-variant">${refill}</yvz-chip></div>` : nothing}
      </div>
    </ha-card>`;
  }

  static override styles: CSSResultGroup = [
    YvzCard.styles,
    css`
      ha-icon {
        --mdc-icon-size: 16px;
      }

      .head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--yvz-space-3);
      }

      p {
        margin: 0;
      }

      .name {
        overflow: hidden;
        font-size: var(--yvz-text-title);
        font-weight: var(--yvz-weight-medium);
        line-height: var(--yvz-line-label);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .status {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-2);
        min-height: var(--yvz-line-label);
        margin-top: 2px;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        line-height: var(--yvz-line-label);
      }

      .status .text {
        display: inline-flex;
        align-items: center;
        gap: var(--yvz-space-1);
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .dot {
        flex: none;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--yvz-state, var(--yvz-accent));
        transition: background var(--yvz-duration-base) var(--yvz-ease);
      }

      .temp {
        flex: none;
        padding: 0;
        border: 0;
        background: none;
        color: var(--yvz-text);
        font: inherit;
        text-align: end;
        cursor: pointer;
      }

      .temp b {
        display: block;
        font-size: var(--yvz-text-big);
        font-variant-numeric: tabular-nums;
        font-weight: var(--yvz-weight-medium);
        line-height: 1;
      }

      .temp small {
        display: block;
        margin-top: var(--yvz-space-1);
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        font-variant-numeric: tabular-nums;
      }

      /* the controls and the line under them sit together, centred in whatever height the card has */
      .main {
        display: flex;
        flex: 1;
        flex-direction: column;
        justify-content: center;
        gap: var(--yvz-space-3);
        width: 100%;
        max-width: 520px;
        margin: var(--yvz-space-4) auto 0;
      }

      .body {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-4);
      }

      .controls {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: var(--yvz-space-3);
        min-width: 0;
        --yvz-icon-button-size: 36px;
      }

      .line {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-2);
      }

      .line .label {
        display: flex;
        flex: 1;
        align-items: center;
        gap: var(--yvz-space-2);
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-body);
      }

      .line .label ha-icon {
        --mdc-icon-size: 18px;
        color: var(--yvz-text);
      }

      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--yvz-space-2);
      }

      /* compact: one row */
      ha-card.compact {
        justify-content: center;
        padding: var(--yvz-space-3);
      }

      .row {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-3);
      }

      .mid {
        flex: 1;
        min-width: 0;
      }

      .temp.small b {
        font-size: var(--yvz-text-value);
      }

      .pair {
        display: flex;
        gap: var(--yvz-space-2);
        --yvz-icon-button-size: 32px;
      }
    `,
  ];
}

registerCard({
  type: "yvz-stove-card",
  name: "YVZ Stove",
  description: "Status and remote for a stove: power, temperature and fan controls, with ignition and run information.",
});

declare global {
  interface HTMLElementTagNameMap {
    "yvz-stove-card": YvzStoveCard;
  }
}
