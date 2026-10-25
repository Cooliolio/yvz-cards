import { html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { prune, YvzCardEditor } from "../../shared/yvz-card-editor";
import type { TranslationKey } from "../../shared/i18n";
import type { HaFormSchema } from "../../shared/types";
import { STOVE_ACTIONS, STOVE_ROLES, type StoveCardConfig } from "./types";

const PRESSABLE = ["script", "button", "input_button", "scene", "switch", "input_boolean"];

@customElement("yvz-stove-card-editor")
export class YvzStoveCardEditor extends YvzCardEditor<StoveCardConfig> {
  private get schema(): HaFormSchema[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "status", selector: { entity: { domain: ["input_select", "select", "sensor"] } } },
      { name: "temperature", selector: { entity: { domain: "sensor", device_class: "temperature" } } },
      { name: "power_sensor", selector: { entity: { domain: "sensor", device_class: "power" } } },
      {
        type: "expandable",
        name: "actions",
        title: this.t("stove.actions"),
        schema: STOVE_ACTIONS.map((name) => ({ name, selector: { entity: { domain: PRESSABLE } } })),
      },
    ];
  }

  private get statusOptions(): string[] {
    const id = this.config?.status;
    const options = id ? this.hass?.states[id]?.attributes.options : undefined;
    return Array.isArray(options) ? options.map(String) : [];
  }

  private get stateMapSchema(): HaFormSchema[] {
    const roles = STOVE_ROLES.map((value) => ({ value, label: this.t(`role.${value}`) }));
    return this.statusOptions.map((name) => ({
      name,
      selector: { select: { mode: "dropdown", options: roles } },
    }));
  }

  private label = (schema: HaFormSchema): string => {
    const key = `stove.field.${schema.name}` as TranslationKey;
    return this.t(key);
  };

  private onMainChanged(event: CustomEvent<{ value: StoveCardConfig }>): void {
    this.emit(prune({ ...event.detail.value }));
  }

  private onMapChanged(event: CustomEvent<{ value: Record<string, string> }>): void {
    const { state_map: _old, ...rest } = this.config as StoveCardConfig;
    this.emit(prune({ ...rest, state_map: event.detail.value }) as StoveCardConfig);
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    const mapSchema = this.stateMapSchema;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${this.schema}
        .computeLabel=${this.label}
        @value-changed=${this.onMainChanged}
      ></ha-form>
      ${mapSchema.length
        ? html`
            <div class="section">
              <h3>${this.t("stove.state_map")}</h3>
              <p class="help">${this.t("stove.state_map_help")}</p>
              <ha-form
                .hass=${this.hass}
                .data=${this.config.state_map ?? {}}
                .schema=${mapSchema}
                .computeLabel=${(s: HaFormSchema) => s.name}
                @value-changed=${this.onMapChanged}
              ></ha-form>
            </div>
          `
        : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-stove-card-editor": YvzStoveCardEditor;
  }
}
