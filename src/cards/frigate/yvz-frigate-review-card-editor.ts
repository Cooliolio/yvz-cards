import { html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import type { TranslationKey } from "../../shared/i18n";
import type { HaFormSchema } from "../../shared/types";
import { prune, YvzCardEditor } from "../../shared/yvz-card-editor";
import { KNOWN_OBJECTS, type FrigateReviewConfig } from "./types";

@customElement("yvz-frigate-review-card-editor")
export class YvzFrigateReviewCardEditor extends YvzCardEditor<FrigateReviewConfig> {
  // Camera names as Frigate knows them are usually the object ids of the camera entities.
  private get cameraOptions(): string[] {
    const ids = Object.keys(this.hass?.states ?? {})
      .filter((id) => id.startsWith("camera."))
      .map((id) => id.slice("camera.".length));
    return [...new Set([...ids, ...(this.config?.cameras ?? [])])].sort();
  }

  private get schema(): HaFormSchema[] {
    const t = this.t;
    const choices = (key: string, values: string[]) => ({
      select: { mode: "dropdown", options: values.map((value) => ({ value, label: t(`frigate.${key}.${value}` as TranslationKey) })) },
    });
    const list = (options: Array<{ value: string; label: string }>) => ({
      select: { multiple: true, custom_value: true, mode: "dropdown", options },
    });
    return [
      { name: "title", selector: { text: {} } },
      { name: "layout", selector: choices("layout", ["strip", "grid"]) },
      { name: "count", selector: { number: { mode: "box", min: 1, max: 30 } } },
      { name: "columns", selector: { number: { mode: "box", min: 1, max: 6 } } },
      { name: "severity", selector: choices("severity", ["alert", "detection", "all"]) },
      { name: "cameras", selector: list(this.cameraOptions.map((value) => ({ value, label: value }))) },
      { name: "labels", selector: list(KNOWN_OBJECTS.map((value) => ({ value, label: t(`frigate.object.${value}` as TranslationKey) }))) },
      {
        type: "expandable",
        name: "advanced",
        flatten: true,
        title: t("frigate.field.advanced"),
        schema: [
          { name: "instance_id", selector: { text: {} } },
          { name: "pre_padding", selector: { number: { mode: "box", min: 0, max: 60 } } },
          { name: "post_padding", selector: { number: { mode: "box", min: 0, max: 60 } } },
          { name: "refresh", selector: { number: { mode: "box", min: 5, max: 3600 } } },
        ],
      },
    ];
  }

  private label = (schema: HaFormSchema): string => this.t(`frigate.field.${schema.name}` as TranslationKey);

  private helper = (schema: HaFormSchema): string | undefined => {
    if (schema.name === "count") return this.t("frigate.help.count");
    if (schema.name === "cameras") return this.t("frigate.help.cameras");
    if (schema.name === "columns") return this.t("frigate.help.columns");
    return undefined;
  };

  private onChanged(event: CustomEvent<{ value: FrigateReviewConfig }>): void {
    this.emit(prune({ ...event.detail.value }));
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    return html`<ha-form
      .hass=${this.hass}
      .data=${this.config}
      .schema=${this.schema}
      .computeLabel=${this.label}
      .computeHelper=${this.helper}
      @value-changed=${this.onChanged}
    ></ha-form>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-frigate-review-card-editor": YvzFrigateReviewCardEditor;
  }
}
