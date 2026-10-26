import { css, html, nothing, type CSSResultGroup } from "lit";
import { customElement, state } from "lit/decorators.js";
import "../../design";
import type { YvzState } from "../../design";
import { runAction, triggerEntity } from "../../shared/actions";
import { formatDuration, formatNumber, formatTime } from "../../shared/format";
import { fireMoreInfo } from "../../shared/more-info";
import { registerCard } from "../../shared/register-card";
import { TickController } from "../../shared/tick-controller";
import type { HassEntity, HomeAssistant, LovelaceCardConfig } from "../../shared/types";
import { YvzCard } from "../../shared/yvz-card";
import "./yvz-stove-card-editor";
import type { StoveAction, StoveCardConfig } from "./types";

const UNAVAILABLE = ["unavailable", "unknown"];
const DEFAULT_ROLES: Record<string, YvzState> = { on: "on", off: "off" };
const QUESTION_KEYS = {
  off: "stove.q_off",
  on: "stove.q_on",
  pending: "stove.q_pending",
  standby: "stove.q_standby",
  error: "stove.q_error",
} as const;

@customElement("yvz-stove-card")
export class YvzStoveCard extends YvzCard<StoveCardConfig> {
  @state() private armed = false;

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
  }

  override getCardSize(): number {
    return 3;
  }

  private statusEntity(): HassEntity | undefined {
    const id = this.config?.status;
    const entity = id ? this.hass?.states[id] : undefined;
    return entity && !UNAVAILABLE.includes(entity.state) ? entity : undefined;
  }

  private stateRole(entity: HassEntity | undefined): YvzState {
    if (!this.config?.status) return "accent";
    if (!entity) return "unavailable";
    return this.config.state_map?.[entity.state] ?? DEFAULT_ROLES[entity.state.toLowerCase()] ?? "accent";
  }

  private async onPower(event: Event): Promise<void> {
    const entity = this.config?.actions?.power;
    if (!this.hass || !entity) return;
    const hass = this.hass;
    await runAction(event.currentTarget as HTMLElement & { status: "idle" }, () => triggerEntity(hass, entity));
  }

  private async onStep(event: CustomEvent<{ direction: -1 | 1 }>, group: "temp" | "fan"): Promise<void> {
    const key = `${group}_${event.detail.direction > 0 ? "up" : "down"}` as StoveAction;
    const entity = this.config?.actions?.[key];
    if (!this.hass || !entity) return;
    const hass = this.hass;
    await runAction(event.currentTarget as HTMLElement & { status: "idle" }, () => triggerEntity(hass, entity));
  }

  private renderTemperature() {
    const id = this.config?.temperature;
    if (!id || !this.hass) return nothing;
    const n = parseFloat(this.hass.states[id]?.state ?? "");
    const text = Number.isNaN(n)
      ? "—"
      : `${formatNumber(this.hass, n, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`;
    return html`
      <button class="temp" slot="end" @click=${() => fireMoreInfo(this, id)}>
        <ha-icon icon="mdi:thermometer"></ha-icon>${text}
      </button>
    `;
  }

  private renderStepper(group: "temp" | "fan") {
    const actions = this.config?.actions;
    if (!actions?.[`${group}_up`] || !actions?.[`${group}_down`]) return nothing;
    const label = this.t(`stove.${group}`);
    return html`
      <yvz-stepper
        .icon=${group === "temp" ? "mdi:thermometer" : "mdi:fan"}
        .label=${label}
        .decreaseLabel=${`${label}: ${this.t("common.decrease")}`}
        .increaseLabel=${`${label}: ${this.t("common.increase")}`}
        @yvz-step=${(e: CustomEvent<{ direction: -1 | 1 }>) => this.onStep(e, group)}
      ></yvz-stepper>
    `;
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    const hass = this.hass;
    const status = this.statusEntity();
    const role = this.stateRole(status);
    const t = this.t;

    const power = this.config.power_sensor ? parseFloat(hass.states[this.config.power_sensor]?.state ?? "") : NaN;
    const showPower = !Number.isNaN(power) && !["off", "error", "unavailable"].includes(role);
    const statusText = status ? (hass.formatEntityState?.(status) ?? status.state) : "";
    const idle = [statusText, showPower ? `${Math.round(power)} W` : ""].filter(Boolean).join(" · ");
    const subtitle = this.armed
      ? `${t(role in QUESTION_KEYS ? QUESTION_KEYS[role as keyof typeof QUESTION_KEYS] : "stove.q_default")} · ${t("common.tap_again")}`
      : idle;

    const chip = status && role !== "off" && role !== "unavailable"
      ? role === "error"
        ? formatTime(hass, status.last_changed)
        : formatDuration(t, Date.now() - new Date(status.last_changed).getTime())
      : "";

    const emphasis = role === "on" ? "glow" : role === "pending" ? "pulse" : "none";

    return html`
      <ha-card data-state=${role}>
        <yvz-card-header
          .icon=${role === "error" ? "mdi:alert" : "mdi:fire"}
          .heading=${this.config.name ?? t("stove.default_name")}
          .subtitle=${subtitle}
        >
          ${chip ? html`<yvz-chip slot="end" icon="mdi:clock-outline">${chip}</yvz-chip>` : nothing}
          ${this.renderTemperature()}
        </yvz-card-header>
        <div class="body">
          ${this.config.actions?.power
            ? html`<yvz-power-button
                .label=${t("stove.power")}
                .confirmLabel=${t("common.confirm")}
                .emphasis=${emphasis}
                @yvz-armed-change=${(e: CustomEvent<{ armed: boolean }>) => (this.armed = e.detail.armed)}
                @yvz-confirm=${this.onPower}
              ></yvz-power-button>`
            : nothing}
          <div class="controls">${this.renderStepper("temp")}${this.renderStepper("fan")}</div>
        </div>
      </ha-card>
    `;
  }

  static override styles: CSSResultGroup = [
    YvzCard.styles,
    css`
      .body {
        display: flex;
        flex: 1;
        align-items: center;
        gap: var(--yvz-space-5);
        margin-top: var(--yvz-space-4);
        padding: 0 var(--yvz-space-2);
      }

      .controls {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: var(--yvz-space-3);
        min-width: 0;
      }

      .temp {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 0;
        border: 0;
        background: none;
        color: var(--yvz-text);
        font: inherit;
        font-weight: var(--yvz-weight-medium);
        cursor: pointer;
      }

      .temp ha-icon {
        --mdc-icon-size: 16px;
        color: var(--yvz-text-muted);
      }
    `,
  ];
}

registerCard({
  type: "yvz-stove-card",
  name: "YVZ Stove",
  description: "Status and remote for a stove: power, temperature and fan controls.",
});

declare global {
  interface HTMLElementTagNameMap {
    "yvz-stove-card": YvzStoveCard;
  }
}
