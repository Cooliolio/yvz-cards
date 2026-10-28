import { css, html, nothing, type CSSResultGroup } from "lit";
import { customElement } from "lit/decorators.js";
import { cssRgb, onColor, presetCall, presetCss, presetMatches } from "../light/color";
import type { LightPreset, LightSceneCardConfig } from "../light/types";
import { haptic } from "../../shared/haptic";
import { registerCard } from "../../shared/register-card";
import type { HomeAssistant, LovelaceCardConfig } from "../../shared/types";
import { YvzCard } from "../../shared/yvz-card";
import "./yvz-light-scene-card-editor";

const DEFAULT_SCENES: LightPreset[] = [
  { name: "Bright", icon: "mdi:white-balance-sunny", brightness: 100, color_temp_kelvin: 4000 },
  { name: "Relax", icon: "mdi:sofa", brightness: 55, color_temp_kelvin: 2700 },
  { name: "Night", icon: "mdi:weather-night", brightness: 8, color_temp_kelvin: 2200 },
  { name: "Off", icon: "mdi:lightbulb-off-outline", off: true },
];

const RGB = /^rgb\((\d+), (\d+), (\d+)\)$/;

@customElement("yvz-light-scene-card")
export class YvzLightSceneCard extends YvzCard<LightSceneCardConfig> {
  static getConfigElement(): HTMLElement {
    return document.createElement("yvz-light-scene-card-editor");
  }

  static getStubConfig(hass?: HomeAssistant): Partial<LightSceneCardConfig> {
    const entity = Object.keys(hass?.states ?? {}).find((id) => id.startsWith("light."));
    return { entity: entity ?? "light.example", scenes: DEFAULT_SCENES };
  }

  setConfig(config: LovelaceCardConfig): void {
    if (!config || typeof config !== "object") throw new Error("yvz-light-scene-card: invalid configuration");
    this.config = config as LightSceneCardConfig;
  }

  override getCardSize(): number {
    return Math.max(1, Math.ceil((this.config?.scenes?.length ?? 0) / 2)) + (this.config?.name ? 1 : 0);
  }

  override getGridOptions(): { columns: number; rows: "auto"; min_columns: number } {
    return { columns: 12, rows: "auto", min_columns: 4 };
  }

  private get targets(): string[] {
    const c = this.config;
    return c?.entities?.length ? c.entities : c?.entity ? [c.entity] : [];
  }

  // The first scene every light that is reachable is showing; with several lights they all have to agree.
  private activeIndex(scenes: LightPreset[]): number {
    const lights = this.targets.map((id) => this.hass?.states[id]).filter((s) => s && s.state !== "unavailable");
    if (!lights.length) return -1;
    return scenes.findIndex((p) => lights.every((l) => presetMatches(p, l)));
  }

  private apply(preset: LightPreset): void {
    const targets = this.targets;
    if (!this.hass || !targets.length) return;
    const { service, data } = presetCall(preset);
    void this.hass.callService("light", service, { entity_id: targets, ...data }).catch(() => undefined);
    haptic("light");
  }

  private describe(p: LightPreset): string {
    if (p.off) return this.t("light.off");
    return [
      p.brightness !== undefined ? `${p.brightness}%` : "",
      p.color_temp_kelvin !== undefined ? `${p.color_temp_kelvin} K` : "",
      p.effect ?? "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    const t = this.t;
    if (!this.targets.length) return html`<ha-card><p class="empty">${t("light.empty")}</p></ha-card>`;
    const scenes = this.config.scenes?.length ? this.config.scenes : [];
    if (!scenes.length) return html`<ha-card><p class="empty">${t("lightscene.none")}</p></ha-card>`;
    const active = this.activeIndex(scenes);
    const gone = this.targets.every((id) => {
      const s = this.hass?.states[id]?.state;
      return !s || s === "unavailable";
    });
    const columns = this.config.columns;
    return html`<ha-card>
      ${this.config.name ? html`<div class="title">${this.config.name}</div>` : nothing}
      <div class="grid" style=${columns ? `grid-template-columns: repeat(${columns}, 1fr)` : nothing}>
        ${scenes.map((p, i) => {
          const color = presetCss(p);
          const rgb = color?.match(RGB)?.slice(1).map(Number) as [number, number, number] | undefined;
          const style = rgb ? `--yvz-state: ${cssRgb(rgb)}; --yvz-on-state: ${onColor(rgb)}` : nothing;
          return html`<yvz-tile
            style=${style}
            .label=${p.name}
            .value=${this.describe(p)}
            .badges=${[{ icon: p.icon ?? "mdi:palette", tint: !!rgb }]}
            .selected=${i === active}
            ?disabled=${gone}
            @click=${() => this.apply(p)}
          ></yvz-tile>`;
        })}
      </div>
    </ha-card>`;
  }

  static override styles: CSSResultGroup = [
    YvzCard.styles,
    css`
      ha-card {
        gap: var(--yvz-space-3);
        justify-content: center;
      }

      .title {
        font-weight: var(--yvz-weight-medium);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: var(--yvz-space-2);
      }

      .empty {
        margin: 0;
        color: var(--yvz-text-muted);
      }
    `,
  ];
}

registerCard({
  type: "yvz-light-scene-card",
  name: "YVZ Light scenes",
  description: "Lighting scenes for one light, a light group or several lights: tap to apply, the active one is highlighted.",
});

declare global {
  interface HTMLElementTagNameMap {
    "yvz-light-scene-card": YvzLightSceneCard;
  }
}
