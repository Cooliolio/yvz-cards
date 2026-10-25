import { css, LitElement } from "lit";
import { property, state } from "lit/decorators.js";
import { createTranslator, type Translator } from "./i18n";
import type { HomeAssistant, LovelaceCardConfig } from "./types";

export abstract class YvzCardEditor<C extends LovelaceCardConfig = LovelaceCardConfig> extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() protected config?: C;

  setConfig(config: LovelaceCardConfig): void {
    this.config = config as C;
  }

  protected get t(): Translator {
    return createTranslator(this.hass);
  }

  protected emit(config: C): void {
    this.config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }),
    );
  }

  static override styles = css`
    :host {
      display: block;
    }

    .section {
      margin-top: 16px;
    }

    .section h3 {
      margin: 0 0 4px;
      font-size: 14px;
      font-weight: 500;
    }

    .help {
      margin: 0 0 12px;
      color: var(--secondary-text-color);
      font-size: 12px;
    }
  `;
}

// Drops empty values so cleared pickers don't leave "" in the saved YAML.
export function prune<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      const nested = prune(v as Record<string, unknown>);
      if (Object.keys(nested).length === 0) continue;
      out[key] = nested;
    } else {
      out[key] = v;
    }
  }
  return out as T;
}
