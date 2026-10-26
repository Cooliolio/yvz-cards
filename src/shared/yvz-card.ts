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
      /* In a panel view the parent has a height and the card fills it; with an auto-height parent
         (sections, masonry) a percentage height computes to auto, so the card stays as tall as its content. */
      :host {
        display: block;
        height: 100%;
      }

      ha-card {
        display: flex;
        flex-direction: column;
        height: 100%;
        box-sizing: border-box;
        padding: var(--yvz-space-4);
        color: var(--yvz-text);
        font-size: var(--yvz-text-body);
        line-height: var(--yvz-line-body);
      }
    `,
  ];
}
