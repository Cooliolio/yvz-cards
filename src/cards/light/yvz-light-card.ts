import { css, html, nothing, type CSSResultGroup, type PropertyValues } from "lit";
import { customElement, state } from "lit/decorators.js";
import { keyed } from "lit/directives/keyed.js";
import { isActionable, pressHandlers } from "../../blocks/actions";
import type { Swatch } from "../../design";
import { registerCard } from "../../shared/register-card";
import type { HassEntity, HomeAssistant, LovelaceCardConfig } from "../../shared/types";
import { YvzCard } from "../../shared/yvz-card";
import "./yvz-light-card-editor";
import {
  capabilities,
  defaultFavorites,
  DEFAULT_MAX_KELVIN,
  DEFAULT_MIN_KELVIN,
  favoriteActive,
  favoriteCss,
  favoriteLabel,
  cssRgb,
  HUE_GRADIENT,
  hsToRgb,
  inColorMode,
  lightRgb,
  onColor,
  saturationGradient,
  temperatureGradient,
  temperatureToRgb,
  toPercent,
} from "./color";
import type { LightCardConfig, LightColor, LightControls } from "./types";

type View = "temperature" | "color";
type HoldKey = "brightness" | "kelvin" | "hue" | "saturation";

// A dragged value is held after release until the light reports it, and no longer than this.
const HOLD_MS = 3000;
// How close the reported value has to be to the committed one: a light rounds, and converts between colour spaces.
const TOLERANCE: Record<HoldKey, number> = { brightness: 2, kelvin: 100, hue: 3, saturation: 3 };

interface Hold {
  value: number;
  // What the light reported when the value was sent, so an old reading that happens to be close doesn't confirm it.
  before?: number;
  timer: ReturnType<typeof setTimeout>;
}

const TIERS: LightControls[] = ["toggle", "brightness", "color"];

@customElement("yvz-light-card")
export class YvzLightCard extends YvzCard<LightCardConfig> {
  // What the user is dragging, and after letting go still shown until the light reports it back (see holds).
  @state() private dragBrightness?: number;
  @state() private dragKelvin?: number;
  @state() private dragHue?: number;
  @state() private dragSaturation?: number;
  @state() private view?: View;
  @state() private favorites?: LightColor[];

  private favoritesFor?: string;
  private holds = new Map<HoldKey, Hold>();

  static getConfigElement(): HTMLElement {
    return document.createElement("yvz-light-card-editor");
  }

  static getStubConfig(hass?: HomeAssistant): Partial<LightCardConfig> {
    const entity = Object.keys(hass?.states ?? {}).find((id) => id.startsWith("light."));
    return { entity: entity ?? "light.example" };
  }

  setConfig(config: LovelaceCardConfig): void {
    if (!config || typeof config !== "object") throw new Error("yvz-light-card: invalid configuration");
    this.config = config as LightCardConfig;
  }

  override getCardSize(): number {
    return this.tier() === "toggle" ? 1 : 2;
  }

  override getGridOptions(): { columns: number; rows: "auto"; min_columns: number } {
    return { columns: 6, rows: "auto", min_columns: 3 };
  }

  private get light(): HassEntity | undefined {
    const id = this.config?.entity;
    return id ? this.hass?.states[id] : undefined;
  }

  // The most the card shows: what was asked for, held back to what the light can do.
  private tier(): LightControls {
    const caps = capabilities(this.light);
    const can: LightControls = caps.temperature || caps.color ? "color" : caps.brightness ? "brightness" : "toggle";
    const wanted = this.config?.controls;
    if (!wanted || wanted === "auto") return can;
    return TIERS.indexOf(wanted) < TIERS.indexOf(can) ? wanted : can;
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has("hass") || changed.has("config")) void this.loadFavorites();
    if (changed.has("hass")) this.confirmHolds();
  }

  // The favourites set in the more-info dialog live in the entity registry; reading them needs admin rights,
  // so anyone else gets the same defaults the dialog starts with.
  private async loadFavorites(): Promise<void> {
    const id = this.config?.entity;
    if (!id || !this.hass || this.tier() !== "color" || this.favoritesFor === id) return;
    this.favoritesFor = id;
    this.favorites = undefined;
    try {
      const entry = await this.hass.callWS<{ options?: { light?: { favorite_colors?: LightColor[] } } }>({
        type: "config/entity_registry/get",
        entity_id: id,
      });
      const saved = entry?.options?.light?.favorite_colors;
      if (this.favoritesFor === id && Array.isArray(saved) && saved.length) this.favorites = saved;
    } catch {
      // not an admin, or no registry entry: the defaults do
    }
  }

  private async call(data: Record<string, unknown>): Promise<boolean> {
    const entity_id = this.config?.entity;
    if (!entity_id || !this.hass) return false;
    try {
      await this.hass.callService("light", "turn_on", { entity_id, ...data });
      return true;
    } catch {
      return false;
    }
  }

  private drag(key: HoldKey): number | undefined {
    return { brightness: this.dragBrightness, kelvin: this.dragKelvin, hue: this.dragHue, saturation: this.dragSaturation }[key];
  }

  // A new drag takes over from whatever was being held for that slider.
  private setDrag(key: HoldKey, value: number | undefined): void {
    const hold = this.holds.get(key);
    if (hold) clearTimeout(hold.timer);
    this.holds.delete(key);
    if (key === "brightness") this.dragBrightness = value;
    else if (key === "kelvin") this.dragKelvin = value;
    else if (key === "hue") this.dragHue = value;
    else this.dragSaturation = value;
  }

  // What the light reports for this slider right now.
  private reading(key: HoldKey): number | undefined {
    const a = this.light?.attributes ?? {};
    const hs = Array.isArray(a.hs_color) ? (a.hs_color as number[]) : undefined;
    const value = { brightness: toPercent(a.brightness), kelvin: Number(a.color_temp_kelvin) || undefined, hue: hs?.[0], saturation: hs?.[1] }[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }

  // The service call is answered as soon as Home Assistant has it, but the light reports its new state only once
  // the device does, which can take seconds. Until then the slider keeps the value it was let go on.
  private async commit(data: Record<string, unknown>, held: Partial<Record<HoldKey, number>> = {}): Promise<void> {
    const keys = Object.keys(held) as HoldKey[];
    // Anything else (a favourite, an effect) replaces whatever the sliders were showing.
    if (!keys.length) for (const key of ["brightness", "kelvin", "hue", "saturation"] as HoldKey[]) this.setDrag(key, undefined);
    for (const key of keys) {
      this.setDrag(key, held[key]);
      this.holds.set(key, { value: held[key]!, before: this.reading(key), timer: setTimeout(() => this.setDrag(key, undefined), HOLD_MS) });
    }
    if (!(await this.call(data))) for (const key of keys) this.setDrag(key, undefined);
  }

  // The light has reported what was sent when it is close to it and is no longer what it was.
  private confirmHolds(): void {
    for (const [key, hold] of this.holds) {
      const now = this.reading(key);
      if (now !== undefined && now !== hold.before && Math.abs(now - hold.value) <= TOLERANCE[key]) this.setDrag(key, undefined);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const hold of this.holds.values()) clearTimeout(hold.timer);
    this.holds.clear();
  }

  private effectiveView(): View {
    const caps = capabilities(this.light);
    if (!caps.color) return "temperature";
    if (!caps.temperature) return "color";
    return this.view ?? (inColorMode(this.light) ? "color" : "temperature");
  }

  private tint(): [number, number, number] {
    const st = this.light;
    if (this.dragHue !== undefined || this.dragSaturation !== undefined) {
      const hs = (st?.attributes.hs_color as number[] | undefined) ?? [0, 100];
      return hsToRgb(this.dragHue ?? hs[0], this.dragSaturation ?? hs[1]);
    }
    if (this.dragKelvin !== undefined) return temperatureToRgb(this.dragKelvin);
    return lightRgb(st);
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    const t = this.t;
    if (!this.config.entity) return html`<ha-card><p class="empty">${t("light.empty")}</p></ha-card>`;
    const st = this.light;
    const gone = !st || st.state === "unavailable" || st.state === "unknown";
    const on = st?.state === "on";
    const name = this.config.name ?? (typeof st?.attributes.friendly_name === "string" ? st.attributes.friendly_name : this.config.entity);
    const icon = this.config.icon ?? (typeof st?.attributes.icon === "string" ? st.attributes.icon : "mdi:lightbulb");
    const percent = this.dragBrightness ?? toPercent(st?.attributes.brightness);
    const status = gone ? t("light.unavailable") : on ? (percent !== undefined && this.tier() !== "toggle" ? `${t("light.on")} · ${percent}%` : t("light.on")) : t("light.off");

    const config = { entity: this.config.entity, tap_action: this.config.tap_action ?? { action: "toggle" as const }, hold_action: this.config.hold_action ?? { action: "more-info" as const } };
    const press = pressHandlers({ hass: this.hass, host: this }, config);
    const actionable = isActionable(config);
    const rgb = this.tint();
    const tint = cssRgb(rgb);
    // the fill is the light's colour, so text on it has to follow: dark on a light yellow, white on a deep blue
    const style = `--yvz-state: ${tint}; --yvz-state-soft: color-mix(in srgb, ${tint} 22%, transparent); --yvz-on-state: ${onColor(rgb)}`;
    const effect = typeof st?.attributes.effect === "string" ? st.attributes.effect : "";
    const running = on && effect !== "" && effect.toLowerCase() !== "none";
    const tier = this.tier();
    const open = on && !gone && tier !== "toggle";
    const compact = this.config.compact === true;

    return html`<ha-card class=${compact ? "compact" : ""} data-state=${gone ? "unavailable" : on ? "on" : "off"} style=${on ? style : nothing}>
      <div
        class="head ${actionable ? "tap" : ""}"
        role=${actionable ? "button" : nothing}
        tabindex=${actionable ? 0 : nothing}
        aria-pressed=${on}
        aria-label=${`${name}, ${status}`}
        @pointerdown=${press.down}
        @pointerup=${press.cancel}
        @pointerleave=${press.cancel}
        @pointercancel=${press.cancel}
        @click=${press.click}
        @contextmenu=${press.menu}
        @keydown=${press.key}
      >
        <yvz-icon-badge class=${running ? "fx" : ""} size=${compact ? "md" : "lg"} .icon=${icon}></yvz-icon-badge>
        <div class="text">
          <div class="name">${name}</div>
          <div class="status">${status}</div>
        </div>
      </div>
      ${tier === "toggle" ? nothing : html`<div class="collapse" ?data-open=${open} ?inert=${!open}><div class="inner">${this.renderControls()}</div></div>`}
    </ha-card>`;
  }

  private renderControls() {
    const t = this.t;
    const tier = this.config?.compact === true && this.tier() === "color" ? "brightness" : this.tier();
    const st = this.light;
    if (!st) return nothing;
    const caps = capabilities(st);
    const a = st.attributes;
    const percent = this.dragBrightness ?? toPercent(a.brightness) ?? 100;
    const brightness = caps.brightness
      ? html`<yvz-slider
          .label=${t("light.brightness")}
          .value=${percent}
          .min=${1}
          .max=${100}
          @yvz-input=${(e: CustomEvent<{ value: number }>) => this.setDrag("brightness", e.detail.value)}
          @yvz-change=${(e: CustomEvent<{ value: number }>) => {
            void this.commit({ brightness_pct: e.detail.value }, { brightness: e.detail.value });
          }}
        ></yvz-slider>`
      : nothing;
    if (tier === "brightness") return html`<div class="body">${brightness}</div>`;

    const view = this.effectiveView();
    const both = caps.temperature && caps.color;
    return html`<div class="body">
      ${brightness}
      ${both
        ? html`<yvz-segmented
            .label=${t("light.mode")}
            .value=${view}
            .options=${[
              { value: "temperature", label: t("light.temperature"), hint: temperatureGradient(Number(st.attributes.min_color_temp_kelvin) || DEFAULT_MIN_KELVIN, Number(st.attributes.max_color_temp_kelvin) || DEFAULT_MAX_KELVIN) },
              { value: "color", label: t("light.color"), hint: HUE_GRADIENT },
            ]}
            @yvz-select=${(e: CustomEvent<{ value: string }>) => (this.view = e.detail.value as View)}
          ></yvz-segmented>`
        : nothing}
      ${keyed(view, html`<div class="fade">${view === "temperature" ? this.renderTemperature(st) : this.renderHueSaturation(st)}</div>`)} ${this.renderFavorites(st)} ${this.renderEffects(st)}
    </div>`;
  }

  private renderTemperature(st: HassEntity) {
    const min = Number(st.attributes.min_color_temp_kelvin) || DEFAULT_MIN_KELVIN;
    const max = Number(st.attributes.max_color_temp_kelvin) || DEFAULT_MAX_KELVIN;
    const kelvin = this.dragKelvin ?? (Number(st.attributes.color_temp_kelvin) || Math.round((min + max) / 2));
    return html`<yvz-slider
      .label=${this.t("light.temperature")}
      .value=${kelvin}
      .min=${min}
      .max=${max}
      .step=${50}
      .gradient=${temperatureGradient(min, max)}
      .thumb=${`rgb(${temperatureToRgb(kelvin).join(", ")})`}
      @yvz-input=${(e: CustomEvent<{ value: number }>) => this.setDrag("kelvin", e.detail.value)}
      @yvz-change=${(e: CustomEvent<{ value: number }>) => {
        void this.commit({ color_temp_kelvin: e.detail.value }, { kelvin: e.detail.value });
      }}
    ></yvz-slider>`;
  }

  private renderHueSaturation(st: HassEntity) {
    const hs = (st.attributes.hs_color as number[] | undefined) ?? [0, 100];
    const hue = this.dragHue ?? hs[0];
    const saturation = this.dragSaturation ?? hs[1];
    const thumb = `rgb(${hsToRgb(hue, saturation).join(", ")})`;
    // hue and saturation travel together, so both are held
    const send = (changed: HoldKey, value: number) => {
      const next = { hue: this.drag("hue") ?? hs[0], saturation: this.drag("saturation") ?? hs[1], [changed]: value };
      void this.commit({ hs_color: [next.hue, next.saturation] }, next);
    };
    return html`<yvz-slider
        .label=${this.t("light.hue")}
        .value=${hue}
        .min=${0}
        .max=${360}
        .gradient=${HUE_GRADIENT}
        .thumb=${thumb}
        @yvz-input=${(e: CustomEvent<{ value: number }>) => this.setDrag("hue", e.detail.value)}
        @yvz-change=${(e: CustomEvent<{ value: number }>) => {
          send("hue", e.detail.value);
        }}
      ></yvz-slider>
      <yvz-slider
        .label=${this.t("light.saturation")}
        .value=${saturation}
        .min=${0}
        .max=${100}
        .gradient=${saturationGradient(hue)}
        .thumb=${thumb}
        @yvz-input=${(e: CustomEvent<{ value: number }>) => this.setDrag("saturation", e.detail.value)}
        @yvz-change=${(e: CustomEvent<{ value: number }>) => {
          send("saturation", e.detail.value);
        }}
      ></yvz-slider>`;
  }

  private renderFavorites(st: HassEntity) {
    const list = this.favorites ?? defaultFavorites(st);
    if (!list.length) return nothing;
    const swatches: Swatch[] = list.map((f) => ({ color: favoriteCss(f), label: favoriteLabel(f), active: favoriteActive(f, st) }));
    return html`<yvz-swatches
      .swatches=${swatches}
      @yvz-select=${(e: CustomEvent<{ index: number }>) => void this.commit({ ...list[e.detail.index] })}
    ></yvz-swatches>`;
  }

  private renderEffects(st: HassEntity) {
    const all = capabilities(st).effects;
    const effects = this.config?.effects?.length ? this.config.effects.filter((e) => all.includes(e)) : all;
    if (!effects.length) return nothing;
    const current = typeof st.attributes.effect === "string" ? st.attributes.effect : "";
    return html`<select
      class="effects"
      aria-label=${this.t("light.effect")}
      @change=${(e: Event) => void this.commit({ effect: (e.target as HTMLSelectElement).value })}
    >
      ${current && !effects.includes(current) ? html`<option value=${current} selected>${current}</option>` : nothing}
      ${effects.map((effect) => html`<option value=${effect} ?selected=${effect === current}>${effect}</option>`)}
    </select>`;
  }

  static override styles: CSSResultGroup = [
    YvzCard.styles,
    css`
      ha-card {
        gap: var(--yvz-space-3);
        justify-content: center;
      }

      ha-card[data-state="unavailable"] {
        opacity: 0.6;
      }

      .head {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-3);
        min-width: 0;
        border-radius: var(--yvz-radius-md);
        outline-offset: 2px;
      }

      .head.tap {
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .text {
        min-width: 0;
      }

      .name {
        overflow: hidden;
        font-weight: var(--yvz-weight-medium);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .status {
        color: var(--yvz-text-muted);
        font-variant-numeric: tabular-nums;
      }

      /* controls open and close by animating the row from 0fr to 1fr, so the card height follows */
      .collapse {
        display: grid;
        grid-template-rows: 0fr;
        margin-top: calc(-1 * var(--yvz-space-3));
        opacity: 0;
        transition:
          grid-template-rows var(--yvz-duration-slow) var(--yvz-ease),
          margin var(--yvz-duration-slow) var(--yvz-ease),
          opacity var(--yvz-duration-base) var(--yvz-ease);
      }

      .collapse[data-open] {
        grid-template-rows: 1fr;
        margin-top: 0;
        opacity: 1;
      }

      .inner {
        min-height: 0;
        overflow: hidden;
      }

      .fade {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-2);
        animation: fade-in var(--yvz-duration-base) var(--yvz-ease);
      }

      @keyframes fade-in {
        from {
          opacity: 0;
        }
      }

      /* a running effect makes the badge breathe */
      yvz-icon-badge.fx {
        animation: breathe 2.4s ease-in-out infinite;
      }

      @keyframes breathe {
        50% {
          opacity: 0.55;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        yvz-icon-badge.fx,
        .fade {
          animation: none;
        }
      }

      /* one row: badge, name and the brightness slider */
      ha-card.compact {
        flex-direction: row;
        align-items: center;
        gap: var(--yvz-space-3);
        padding: var(--yvz-space-3);
      }

      ha-card.compact .head {
        flex: 1;
      }

      ha-card.compact .collapse {
        flex: 1.2;
        min-width: 0;
        margin-top: 0;
        grid-template-rows: 1fr;
        grid-template-columns: 0fr;
        transition:
          grid-template-columns var(--yvz-duration-slow) var(--yvz-ease),
          opacity var(--yvz-duration-base) var(--yvz-ease);
      }

      ha-card.compact .collapse[data-open] {
        grid-template-columns: 1fr;
      }

      .body {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-2);
      }

      .effects {
        width: 100%;
        padding: var(--yvz-space-2) var(--yvz-space-3);
        border: 0;
        border-radius: var(--yvz-radius-md);
        background: var(--yvz-surface-raised);
        color: var(--yvz-text);
        font: inherit;
      }

      .empty {
        margin: 0;
        color: var(--yvz-text-muted);
      }
    `,
  ];
}

registerCard({
  type: "yvz-light-card",
  name: "YVZ Light",
  description: "A light: toggle, brightness, and colour temperature, colour and favourites, as far as the light can.",
});

declare global {
  interface HTMLElementTagNameMap {
    "yvz-light-card": YvzLightCard;
  }
}
