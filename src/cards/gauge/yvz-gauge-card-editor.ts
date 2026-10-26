import { html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import type { TranslationKey } from "../../shared/i18n";
import type { HaFormSchema } from "../../shared/types";
import { prune, YvzCardEditor } from "../../shared/yvz-card-editor";
import type { GaugeCardConfig } from "./types";

const number = { selector: { number: { mode: "box" } } };

@customElement("yvz-gauge-card-editor")
export class YvzGaugeCardEditor extends YvzCardEditor<GaugeCardConfig> {
  private get schema(): HaFormSchema[] {
    const t = this.t;
    return [
      { name: "entity", required: true, selector: { entity: {} } },
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      {
        name: "variant",
        selector: {
          select: {
            mode: "dropdown",
            options: ["line", "segments", "stat"].map((value) => ({ value, label: t(`gauge.variant.${value}` as TranslationKey) })),
          },
        },
      },
      { name: "warn_at", ...number },
      { name: "error_at", ...number },
      { name: "invert", selector: { boolean: {} } },
      { name: "trend", selector: { boolean: {} } },
      {
        type: "expandable",
        name: "advanced",
        flatten: true,
        title: t("gauge.field.advanced"),
        schema: [
          { name: "unit", selector: { text: {} } },
          { name: "min", ...number },
          { name: "max", ...number },
          { name: "decimals", selector: { number: { mode: "box", min: 0, max: 4 } } },
          { name: "target", ...number },
          { name: "trend_hours", selector: { number: { mode: "box", min: 1, max: 168 } } },
          { name: "tap_action", selector: { ui_action: {} } },
          { name: "hold_action", selector: { ui_action: {} } },
        ],
      },
    ];
  }

  private label = (schema: HaFormSchema): string => this.t(`gauge.field.${schema.name}` as TranslationKey);

  private onChanged(event: CustomEvent<{ value: GaugeCardConfig }>): void {
    this.emit(prune({ ...event.detail.value }));
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    return html`<ha-form
      .hass=${this.hass}
      .data=${this.config}
      .schema=${this.schema}
      .computeLabel=${this.label}
      @value-changed=${this.onChanged}
    ></ha-form>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-gauge-card-editor": YvzGaugeCardEditor;
  }
}
