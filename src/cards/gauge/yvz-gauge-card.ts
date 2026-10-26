import { css, html, nothing, type CSSResultGroup } from "lit";
import { customElement } from "lit/decorators.js";
import { gaugeBlockStyles, renderGaugeBlock, type GaugeBlockConfig } from "../../blocks/gauge";
import { registerCard } from "../../shared/register-card";
import type { HomeAssistant, LovelaceCardConfig } from "../../shared/types";
import { YvzCard } from "../../shared/yvz-card";
import "./yvz-gauge-card-editor";
import type { GaugeCardConfig } from "./types";

@customElement("yvz-gauge-card")
export class YvzGaugeCard extends YvzCard<GaugeCardConfig> {
  static getConfigElement(): HTMLElement {
    return document.createElement("yvz-gauge-card-editor");
  }

  static getStubConfig(hass?: HomeAssistant): Partial<GaugeCardConfig> {
    const entity = Object.values(hass?.states ?? {}).find(
      (s) => s.entity_id.startsWith("sensor.") && s.attributes.unit_of_measurement === "%",
    )?.entity_id;
    return { entity: entity ?? "sensor.example", warn_at: 70, error_at: 90 };
  }

  setConfig(config: LovelaceCardConfig): void {
    if (!config || typeof config !== "object") throw new Error("yvz-gauge-card: invalid configuration");
    this.config = config as GaugeCardConfig;
  }

  override getCardSize(): number {
    return this.config?.trend ? 2 : 1;
  }

  override getGridOptions(): { columns: number; rows: "auto"; min_columns: number } {
    return { columns: 6, rows: "auto", min_columns: 3 };
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    if (!this.config.entity) return html`<ha-card><p class="empty">${this.t("gauge.empty")}</p></ha-card>`;
    return html`<ha-card>${renderGaugeBlock({ hass: this.hass, host: this }, this.config as GaugeBlockConfig)}</ha-card>`;
  }

  static override styles: CSSResultGroup = [
    YvzCard.styles,
    gaugeBlockStyles,
    css`
      ha-card {
        justify-content: center;
      }

      .empty {
        margin: 0;
        color: var(--yvz-text-muted);
      }
    `,
  ];
}

registerCard({
  type: "yvz-gauge-card",
  name: "YVZ Gauge",
  description: "One value as a line, segmented or stat gauge, with colour thresholds and an optional trend.",
});

declare global {
  interface HTMLElementTagNameMap {
    "yvz-gauge-card": YvzGaugeCard;
  }
}
