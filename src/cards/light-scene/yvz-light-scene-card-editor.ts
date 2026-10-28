import { html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import type { TranslationKey } from "../../shared/i18n";
import type { HaFormSchema } from "../../shared/types";
import { prune, YvzCardEditor } from "../../shared/yvz-card-editor";
import type { LightSceneCardConfig } from "../light/types";

@customElement("yvz-light-scene-card-editor")
export class YvzLightSceneCardEditor extends YvzCardEditor<LightSceneCardConfig> {
  private get schema(): HaFormSchema[] {
    return [
      { name: "entities", required: true, selector: { entity: { domain: "light", multiple: true } } },
      { name: "name", selector: { text: {} } },
      { name: "columns", selector: { number: { mode: "box", min: 1, max: 6 } } },
      // brightness, colour and effect per scene, in the terms of light.turn_on; the README has examples
      { name: "scenes", selector: { object: {} } },
    ];
  }

  private label = (schema: HaFormSchema): string => this.t(`lightscene.field.${schema.name}` as TranslationKey);

  private onChanged(event: CustomEvent<{ value: LightSceneCardConfig }>): void {
    const value = { ...event.detail.value };
    // One light picked is the plain `entity`, the same as a hand-written card.
    if (value.entities?.length === 1) {
      value.entity = value.entities[0];
      delete value.entities;
    } else if (value.entities) delete value.entity;
    this.emit(prune(value));
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    const data = { ...this.config, entities: this.config.entities ?? (this.config.entity ? [this.config.entity] : []) };
    return html`<ha-form
      .hass=${this.hass}
      .data=${data}
      .schema=${this.schema}
      .computeLabel=${this.label}
      @value-changed=${this.onChanged}
    ></ha-form>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-light-scene-card-editor": YvzLightSceneCardEditor;
  }
}
