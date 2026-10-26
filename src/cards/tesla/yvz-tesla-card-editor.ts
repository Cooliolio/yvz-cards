import { html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import type { TranslationKey } from "../../shared/i18n";
import type { HaFormSchema } from "../../shared/types";
import { prune, YvzCardEditor } from "../../shared/yvz-card-editor";
import {
  CONTROL_KEYS,
  DEFAULT_CONTROLS,
  EDITOR_ENTITY_KEYS,
  PAINTS,
  TESLA_ENTITIES,
  TESLA_PLATFORMS,
  type TeslaCardConfig,
} from "./types";

@customElement("yvz-tesla-card-editor")
export class YvzTeslaCardEditor extends YvzCardEditor<TeslaCardConfig> {
  private get schema(): HaFormSchema[] {
    const t = this.t;
    return [
      { name: "device_id", selector: { device: { filter: TESLA_PLATFORMS.map((integration) => ({ integration })) } } },
      { name: "name", selector: { text: {} } },
      { name: "compact", selector: { boolean: {} } },
      {
        name: "paint",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              ...Object.entries(PAINTS).map(([value, p]) => ({ value, label: p.label })),
              { value: "custom", label: t("tesla.paint_custom") },
            ],
          },
        },
      },
      ...(this.config?.paint === "custom" ? [{ name: "paint_rgb", selector: { color_rgb: {} } }] : []),
      { name: "show_climate", selector: { boolean: {} } },
      { name: "show_charge_limit", selector: { boolean: {} } },
      {
        name: "controls",
        selector: {
          select: {
            multiple: true,
            mode: "list",
            options: CONTROL_KEYS.map((value) => ({ value, label: t(`tesla.control.${value}` as TranslationKey) })),
          },
        },
      },
      {
        type: "expandable" as const,
        name: "entities",
        title: t("tesla.field.entities"),
        schema: EDITOR_ENTITY_KEYS.map((key) => ({
          name: key,
          selector: { entity: { domain: TESLA_ENTITIES[key].domain } },
        })),
      },
    ];
  }

  private label = (schema: HaFormSchema): string => this.t(`tesla.field.${schema.name}` as TranslationKey);

  private helper = (schema: HaFormSchema): string | undefined =>
    schema.name === "device_id"
      ? this.t("tesla.help.device_id")
      : schema.name === "controls"
        ? this.t("tesla.help.controls")
        : undefined;

  private onChanged(event: CustomEvent<{ value: TeslaCardConfig }>): void {
    const value = { ...event.detail.value };
    // Switches are on by default, so only the off state is worth saving.
    if (value.show_climate === true) delete value.show_climate;
    if (value.show_charge_limit === true) delete value.show_charge_limit;
    if (value.paint !== "custom") delete value.paint_rgb;
    this.emit(prune(value));
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    const data = {
      paint: "stealth_grey",
      show_climate: true,
      show_charge_limit: true,
      controls: DEFAULT_CONTROLS,
      ...this.config,
    };
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${this.schema}
        .computeLabel=${this.label}
        .computeHelper=${this.helper}
        @value-changed=${this.onChanged}
      ></ha-form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-tesla-card-editor": YvzTeslaCardEditor;
  }
}
