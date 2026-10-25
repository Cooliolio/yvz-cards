import { html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import type { TranslationKey } from "../../shared/i18n";
import type { HaFormSchema } from "../../shared/types";
import "../../shared/yvz-list-editor";
import { prune, YvzCardEditor } from "../../shared/yvz-card-editor";
import type { HostCardConfig, HostGuest, HostSensor } from "./types";

const sensor = (extra: Record<string, unknown> = {}) => ({ selector: { entity: { domain: "sensor", ...extra } } });
const number = { selector: { number: { mode: "box" } } };

@customElement("yvz-host-card-editor")
export class YvzHostCardEditor extends YvzCardEditor<HostCardConfig> {
  private get schema(): HaFormSchema[] {
    const t = this.t;
    return [
      { name: "name", selector: { text: {} } },
      { name: "status", selector: { entity: { domain: "binary_sensor" } } },
      { name: "uptime", ...sensor() },
      { name: "temperature", ...sensor({ device_class: "temperature" }) },
      { name: "cpu", ...sensor() },
      { name: "memory", ...sensor() },
      { name: "trend", selector: { boolean: {} } },
      {
        type: "expandable",
        name: "network",
        title: t("host.field.network"),
        schema: [
          { name: "down", ...sensor() },
          { name: "up", ...sensor() },
        ],
      },
      {
        type: "expandable",
        name: "disk_io",
        title: t("host.field.disk_io"),
        schema: [
          { name: "read", ...sensor() },
          { name: "write", ...sensor() },
        ],
      },
    ];
  }

  private get sensorSchema(): HaFormSchema[] {
    return [
      { name: "entity", required: true, ...sensor() },
      { name: "name", selector: { text: {} } },
      { name: "warn_at", ...number },
      { name: "error_at", ...number },
    ];
  }

  private get guestSchema(): HaFormSchema[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "prefix", selector: { text: {} } },
      {
        type: "expandable",
        name: "overrides",
        flatten: true,
        title: this.t("host.overrides"),
        schema: [
          { name: "status", selector: { entity: { domain: "binary_sensor" } } },
          { name: "cpu", ...sensor() },
          { name: "memory", ...sensor() },
          { name: "disk", ...sensor() },
          { name: "uptime", ...sensor() },
        ],
      },
    ];
  }

  private label = (schema: HaFormSchema): string => this.t(`host.field.${schema.name}` as TranslationKey);

  private onMainChanged(event: CustomEvent<{ value: HostCardConfig }>): void {
    this.emit(prune({ ...event.detail.value }));
  }

  private setList(key: "temperatures" | "disks" | "guests", items: Record<string, unknown>[]): void {
    const config = { ...this.config! } as HostCardConfig;
    if (items.length) (config as Record<string, unknown>)[key] = items.map((i) => prune(i));
    else delete config[key];
    this.emit(config);
  }

  private sensorTitle = (item: Record<string, unknown>, index: number): string => {
    const s = item as HostSensor;
    return s.name || (s.entity ? String(this.hass?.states[s.entity]?.attributes.friendly_name ?? s.entity) : `${this.t("host.item")} ${index + 1}`);
  };

  private guestTitle = (item: Record<string, unknown>, index: number): string => {
    const g = item as HostGuest;
    return g.name || g.prefix || `${this.t("host.item")} ${index + 1}`;
  };

  private list(
    key: "temperatures" | "disks" | "guests",
    title: string,
    addLabel: string,
    schema: HaFormSchema[],
    itemTitle: (item: Record<string, unknown>, index: number) => string,
  ) {
    return html`
      <div class="section">
        <h3>${title}</h3>
        <yvz-list-editor
          .hass=${this.hass}
          .items=${(this.config?.[key] ?? []) as Record<string, unknown>[]}
          .schema=${schema}
          .computeLabel=${this.label}
          .itemTitle=${itemTitle}
          .addLabel=${addLabel}
          .removeLabel=${this.t("host.remove")}
          .moveUpLabel=${this.t("host.move_up")}
          .moveDownLabel=${this.t("host.move_down")}
          @items-changed=${(e: CustomEvent<{ items: Record<string, unknown>[] }>) => this.setList(key, e.detail.items)}
        ></yvz-list-editor>
      </div>
    `;
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    const t = this.t;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${this.schema}
        .computeLabel=${this.label}
        @value-changed=${this.onMainChanged}
      ></ha-form>
      ${this.list("temperatures", t("host.section_temps"), t("host.add_temperature"), this.sensorSchema, this.sensorTitle)}
      ${this.list("disks", t("host.section_storage"), t("host.add_disk"), this.sensorSchema, this.sensorTitle)}
      ${this.list("guests", t("host.section_guests"), t("host.add_guest"), this.guestSchema, this.guestTitle)}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-host-card-editor": YvzHostCardEditor;
  }
}
