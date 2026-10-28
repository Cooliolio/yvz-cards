import { html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import type { TranslationKey } from "../../shared/i18n";
import type { HaFormSchema } from "../../shared/types";
import { prune, YvzCardEditor } from "../../shared/yvz-card-editor";
import { LIGHT_CONTROLS, type LightCardConfig } from "./types";

@customElement("yvz-light-card-editor")
export class YvzLightCardEditor extends YvzCardEditor<LightCardConfig> {
  private get schema(): HaFormSchema[] {
    const t = this.t;
    return [
      { name: "entity", required: true, selector: { entity: { domain: "light" } } },
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      {
        name: "controls",
        selector: {
          select: {
            mode: "dropdown",
            options: ["auto", ...LIGHT_CONTROLS].map((value) => ({ value, label: t(`light.controls.${value}` as TranslationKey) })),
          },
        },
      },
      { name: "compact", selector: { boolean: {} } },
      {
        type: "expandable",
        name: "advanced",
        flatten: true,
        title: t("light.field.advanced"),
        schema: [
          { name: "tap_action", selector: { ui_action: {} } },
          { name: "hold_action", selector: { ui_action: {} } },
        ],
      },
    ];
  }

  private label = (schema: HaFormSchema): string => this.t(`light.field.${schema.name}` as TranslationKey);

  private onChanged(event: CustomEvent<{ value: LightCardConfig }>): void {
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
    "yvz-light-card-editor": YvzLightCardEditor;
  }
}
