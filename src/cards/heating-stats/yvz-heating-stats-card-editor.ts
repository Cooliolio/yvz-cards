import { html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import type { TranslationKey } from "../../shared/i18n";
import type { HaFormSchema } from "../../shared/types";
import { prune, YvzCardEditor } from "../../shared/yvz-card-editor";
import {
  PERIODS,
  STATS_ENTITIES,
  STATS_GROUPS,
  STATS_LONG_TERM,
  type HeatingStatsConfig,
  type StatsEntityKey,
  type StatsLongTermKey,
} from "./types";

const DEFAULTS: Record<string, string> = { ...STATS_ENTITIES, ...STATS_LONG_TERM };

@customElement("yvz-heating-stats-card-editor")
export class YvzHeatingStatsCardEditor extends YvzCardEditor<HeatingStatsConfig> {
  private get schema(): HaFormSchema[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "compact", selector: { boolean: {} } },
      {
        name: "period",
        selector: {
          select: {
            mode: "dropdown",
            options: PERIODS.map((value) => ({ value, label: this.t(`hstats.period.${value}` as TranslationKey) })),
          },
        },
      },
      ...Object.entries(STATS_GROUPS).map(([group, keys]) => ({
        type: "expandable" as const,
        name: group,
        flatten: true,
        title: this.t(`hstats.group.${group}` as TranslationKey),
        // Each picker is limited to the domain of the default it replaces.
        schema: keys.map((key: StatsEntityKey | StatsLongTermKey) => ({
          name: key,
          selector: { entity: { domain: DEFAULTS[key].split(".")[0] } },
        })),
      })),
    ];
  }

  private label = (schema: HaFormSchema): string => this.t(`hstats.field.${schema.name}` as TranslationKey);

  private onChanged(event: CustomEvent<{ value: HeatingStatsConfig }>): void {
    this.emit(prune({ ...event.detail.value }));
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    return html`
      <p class="help">${this.t("hstats.entities_help")}</p>
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
    "yvz-heating-stats-card-editor": YvzHeatingStatsCardEditor;
  }
}
