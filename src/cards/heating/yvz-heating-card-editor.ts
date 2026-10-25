import { html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import type { TranslationKey } from "../../shared/i18n";
import type { HaFormSchema } from "../../shared/types";
import { prune, YvzCardEditor } from "../../shared/yvz-card-editor";
import { HEATING_ENTITIES, HEATING_GROUPS, type HeatingCardConfig } from "./types";

@customElement("yvz-heating-card-editor")
export class YvzHeatingCardEditor extends YvzCardEditor<HeatingCardConfig> {
  private get schema(): HaFormSchema[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "compact", selector: { boolean: {} } },
      ...Object.entries(HEATING_GROUPS).map(([group, keys]) => ({
        type: "expandable" as const,
        name: group,
        flatten: true,
        title: this.t(`heating.group.${group}` as TranslationKey),
        // Each picker is limited to the domain of the default it replaces.
        schema: keys.map((key) => ({
          name: key,
          selector: { entity: { domain: HEATING_ENTITIES[key].split(".")[0] } },
        })),
      })),
    ];
  }

  private label = (schema: HaFormSchema): string => this.t(`heating.field.${schema.name}` as TranslationKey);

  private onChanged(event: CustomEvent<{ value: HeatingCardConfig }>): void {
    this.emit(prune({ ...event.detail.value }));
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    return html`
      <p class="help">${this.t("heating.entities_help")}</p>
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${this.schema}
        .computeLabel=${this.label}
        @value-changed=${this.onChanged}
      ></ha-form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-heating-card-editor": YvzHeatingCardEditor;
  }
}
