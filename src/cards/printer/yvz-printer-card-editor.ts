import { html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import type { TranslationKey } from "../../shared/i18n";
import type { HaFormSchema } from "../../shared/types";
import "../../shared/yvz-list-editor";
import { prune, YvzCardEditor } from "../../shared/yvz-card-editor";
import type { PrinterCardConfig, PrinterPreset } from "./types";

const entity = (domain: string | string[]) => ({ selector: { entity: { domain } } });

@customElement("yvz-printer-card-editor")
export class YvzPrinterCardEditor extends YvzCardEditor<PrinterCardConfig> {
  private get schema(): HaFormSchema[] {
    const t = this.t;
    const group = (name: string, schema: HaFormSchema[], flatten = false): HaFormSchema => ({
      type: "expandable",
      name,
      flatten,
      title: t(`printer.group.${name}` as TranslationKey),
      schema,
    });
    return [
      { name: "name", selector: { text: {} } },
      { name: "camera", ...entity("camera") },
      { name: "power", ...entity(["switch", "input_boolean"]) },
      { name: "step", selector: { number: { mode: "box", min: 1, max: 50 } } },
      { name: "bed_safe", selector: { number: { mode: "box", min: 20, max: 100 } } },
      group(
        "sensors",
        [
          { name: "printing", ...entity("binary_sensor") },
          { name: "state", ...entity("sensor") },
          { name: "progress", ...entity("sensor") },
          { name: "finish", ...entity("sensor") },
          { name: "file", ...entity("sensor") },
          { name: "start", ...entity("sensor") },
        ],
        true,
      ),
      group("hotend", [
        { name: "actual", ...entity("sensor") },
        { name: "target", ...entity("number") },
      ]),
      group("bed", [
        { name: "actual", ...entity("sensor") },
        { name: "target", ...entity("number") },
      ]),
      group("buttons", [
        { name: "pause", ...entity("button") },
        { name: "resume", ...entity("button") },
        { name: "stop", ...entity("button") },
      ]),
      group("scripts", [
        { name: "power_on", ...entity("script") },
        { name: "preheat_pla", ...entity("script") },
        { name: "preheat_petg", ...entity("script") },
        { name: "cooldown", ...entity("script") },
        { name: "temp_adjust", ...entity("script") },
        { name: "power_off", ...entity("script") },
      ]),
    ];
  }

  private label = (schema: HaFormSchema): string => this.t(`printer.field.${schema.name}` as TranslationKey);

  private get presetSchema(): HaFormSchema[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "hotend", selector: { number: { mode: "box", min: 0, max: 350 } } },
      { name: "bed", selector: { number: { mode: "box", min: 0, max: 150 } } },
      { name: "icon", selector: { icon: {} } },
      { name: "script", ...entity("script") },
    ];
  }

  private setPresets(items: PrinterPreset[]): void {
    const { presets: _old, ...rest } = this.config as PrinterCardConfig;
    this.emit(prune({ ...rest, ...(items.length ? { presets: items } : {}) }) as PrinterCardConfig);
  }

  private onChanged(event: CustomEvent<{ value: PrinterCardConfig }>): void {
    this.emit(prune({ ...event.detail.value }));
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    return html`
      <p class="help">${this.t("printer.entities_help")}</p>
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${this.schema}
        .computeLabel=${this.label}
        @value-changed=${this.onChanged}
      ></ha-form>
      <div class="section">
        <h3>${this.t("printer.presets")}</h3>
        <p class="help">${this.t("printer.presets_help")}</p>
        <yvz-list-editor
          .hass=${this.hass}
          .items=${(this.config.presets ?? []) as unknown as Record<string, unknown>[]}
          .schema=${this.presetSchema}
          .computeLabel=${this.label}
          .itemTitle=${(item: Record<string, unknown>, i: number) => String(item.name || `${this.t("printer.preset")} ${i + 1}`)}
          .addLabel=${this.t("printer.add_preset")}
          .removeLabel=${this.t("host.remove")}
          .moveUpLabel=${this.t("host.move_up")}
          .moveDownLabel=${this.t("host.move_down")}
          @items-changed=${(e: CustomEvent<{ items: PrinterPreset[] }>) => this.setPresets(e.detail.items)}
        ></yvz-list-editor>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-printer-card-editor": YvzPrinterCardEditor;
  }
}
