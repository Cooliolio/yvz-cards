import { css, LitElement, type CSSResultGroup } from "lit";
import { property, state } from "lit/decorators.js";
import { designStyles } from "../design";
import { createTranslator, type Translator } from "./i18n";
import type { HomeAssistant, LovelaceCardConfig } from "./types";

export abstract class YvzCard<C extends LovelaceCardConfig = LovelaceCardConfig> extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() protected config?: C;

  abstract setConfig(config: LovelaceCardConfig): void;

  protected get t(): Translator {
    return createTranslator(this.hass);
  }

  getCardSize(): number {
    return 3;
  }

  getGridOptions(): { columns: number; rows: "auto"; min_columns: number } {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  static override styles: CSSResultGroup = [
    designStyles,
    css`
      :host {
        display: block;
      }

      ha-card {
        padding: var(--yvz-space-4);
        color: var(--yvz-text);
        font-size: var(--yvz-text-body);
        line-height: var(--yvz-line-body);
      }
    `,
  ];
}
