import { css, html, nothing, type CSSResultGroup, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import "../../design";
import type { YvzState } from "../../design";
import { runAction } from "../../shared/actions";
import { formatDuration, formatTime } from "../../shared/format";
import { haptic } from "../../shared/haptic";
import { fireMoreInfo } from "../../shared/more-info";
import { registerCard } from "../../shared/register-card";
import { TickController } from "../../shared/tick-controller";
import type { HassEntity, LovelaceCardConfig } from "../../shared/types";
import { YvzCard } from "../../shared/yvz-card";
import "./yvz-printer-card-editor";
import {
  ERROR_STATES,
  PAUSED_STATES,
  PRINTER_DEFAULTS,
  PRINTING_STATES,
  READY_STATES,
  type PrinterCardConfig,
  type PrinterMode,
  type PrinterPreset,
} from "./types";

const UNAVAILABLE = ["unavailable", "unknown"];
// Highest value the temperature fields accept when the target entity doesn't say.
const HOTEND_MAX = 350;
const BED_MAX = 150;
const ROLES: Record<PrinterMode, YvzState> = {
  off: "off",
  wait: "off",
  ready: "standby",
  print: "on",
  pause: "pending",
  error: "error",
};

type Pressable = HTMLElement & { status: "idle" };
type Config = typeof PRINTER_DEFAULTS & Pick<PrinterCardConfig, "name" | "presets">;

@customElement("yvz-printer-card")
export class YvzPrinterCard extends YvzCard<PrinterCardConfig> {
  @state() private cameraSrc = "";

  constructor() {
    super();
    new TickController(this, 30_000);
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("yvz-printer-card-editor");
  }

  static getStubConfig(): Partial<PrinterCardConfig> {
    return {};
  }

  setConfig(config: LovelaceCardConfig): void {
    if (!config || typeof config !== "object") throw new Error("yvz-printer-card: invalid configuration");
    this.config = config as PrinterCardConfig;
    this.cameraSrc = "";
  }

  override getCardSize(): number {
    return 5;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("visibilitychange", this.onVisible);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("visibilitychange", this.onVisible);
  }

  // A stream that was cut while the tab was hidden starts again when it comes back.
  private onVisible = (): void => {
    if (document.visibilityState === "visible") this.refreshCamera();
  };

  /* ---------- config and state ---------- */

  // The user's options on top of the OctoPrint defaults, nested ones merged key by key.
  private get cfg(): Config {
    const c = this.config ?? ({} as PrinterCardConfig);
    const d = PRINTER_DEFAULTS;
    return {
      ...d,
      ...c,
      hotend: { ...d.hotend, ...c.hotend },
      bed: { ...d.bed, ...c.bed },
      buttons: { ...d.buttons, ...c.buttons },
      scripts: { ...d.scripts, ...c.scripts },
      step: c.step ?? d.step,
      bed_safe: c.bed_safe ?? d.bed_safe,
    } as Config;
  }

  private st(id: string): HassEntity | undefined {
    return this.hass?.states[id];
  }

  private raw(id: string): string | undefined {
    return this.st(id)?.state;
  }

  private num(id: string): number | undefined {
    const n = parseFloat(this.raw(id) ?? "");
    return Number.isNaN(n) ? undefined : n;
  }

  private deg(id: string): string {
    const n = this.num(id);
    return n === undefined ? "—" : `${Math.round(n)}°`;
  }

  private get mode(): PrinterMode {
    const c = this.cfg;
    if (this.raw(c.power) !== "on") return "off";
    const state = String(this.raw(c.state) ?? "").toLowerCase();
    if (PAUSED_STATES.includes(state)) return "pause";
    if (PRINTING_STATES.includes(state) || this.raw(c.printing) === "on") return "print";
    if (ERROR_STATES.includes(state)) return "error";
    if (READY_STATES.includes(state)) return "ready";
    return "wait";
  }

  // A print that ran to the end: OctoPrint is ready again and its job still reads 100 %.
  private get finished(): { at: number; took?: number } | undefined {
    const c = this.cfg;
    if (this.mode !== "ready" || (this.num(c.progress) ?? 0) < 99.5) return undefined;
    const since = this.st(c.state)?.last_changed;
    const at = since ? Date.parse(since) : NaN;
    if (Number.isNaN(at)) return undefined;
    const start = Date.parse(this.raw(c.start) ?? "");
    const took = !Number.isNaN(start) && at > start && at - start < 7 * 86_400_000 ? at - start : undefined;
    return { at, took };
  }

  /* ---------- camera ---------- */

  protected override willUpdate(): void {
    if (this.hass && !this.cameraSrc) this.refreshCamera();
  }

  // The still picture's address carries the access token; swapping it for the stream address gives live video.
  private refreshCamera(): void {
    const picture = this.st(this.cfg.camera)?.attributes.entity_picture;
    if (typeof picture !== "string" || !picture) {
      this.cameraSrc = "";
      return;
    }
    const url = picture.replace("/camera_proxy/", "/camera_proxy_stream/");
    // A fresh query makes the browser open the stream again even if the address is otherwise the same.
    this.cameraSrc = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
  }

  /* ---------- actions ---------- */

  private run(event: Event, action: () => Promise<unknown>): Promise<boolean> {
    haptic("light");
    return runAction(event.currentTarget as Pressable, action);
  }

  private script = (entity: string) => () => this.hass!.callService("script", "turn_on", { entity_id: entity });
  private press = (entity: string) => () => this.hass!.callService("button", "press", { entity_id: entity });

  private onAdjust(event: Event, entity: string, delta: number): void {
    const [domain, service] = this.cfg.scripts.temp_adjust.split(".");
    void this.run(event, () => this.hass!.callService(domain, service, { entity, delta }));
  }

  // A preset sets both targets, or runs its own script.
  private onPreset(event: Event, preset: PrinterPreset): void {
    const { hotend, bed } = this.cfg;
    const hass = this.hass!;
    void this.run(event, async () => {
      if (preset.script) {
        await hass.callService("script", "turn_on", { entity_id: preset.script });
        return;
      }
      const set = (entity_id: string, value?: number) =>
        value === undefined ? undefined : hass.callService("number", "set_value", { entity_id, value });
      await Promise.all([set(hotend.target, preset.hotend), set(bed.target, preset.bed)]);
    });
  }

  // A typed temperature goes through the same script, as the step from the current target.
  private onSet(event: Event, entity: string, value: number): void {
    const delta = value - (this.num(entity) ?? 0);
    if (delta !== 0) this.onAdjust(event, entity, delta);
  }

  /* ---------- render pieces ---------- */

  private statusText(mode: PrinterMode): string {
    const t = this.t;
    const c = this.cfg;
    if (mode === "ready") {
      const name = this.finished ? t("printer.status.finished") : t("printer.status.ready");
      return `${name} · ${this.deg(c.hotend.actual)} / ${this.deg(c.bed.actual)}`;
    }
    return t(`printer.status.${mode}`);
  }

  private renderTemperature(label: string, temp: { actual: string; target: string }, max: number) {
    const t = this.t;
    const step = this.cfg.step;
    const attributes = this.st(temp.target)?.attributes ?? {};
    const limit = (name: string, fallback: number) => (Number.isFinite(Number(attributes[name])) ? Number(attributes[name]) : fallback);
    const target = this.num(temp.target);
    // While it is heating up, how it got there is worth a glance.
    const heating = (target ?? 0) > 0;
    return html`<div class="temp"><div class="line">
      <span class="name">${label}</span>
      <b class="now">${this.deg(temp.actual)}</b>
      <span class="to">→</span>
      <yvz-number-field
        .value=${target === undefined ? undefined : Math.round(target * 10) / 10}
        .min=${limit("min", 0)}
        .max=${limit("max", max)}
        .step=${limit("step", 1)}
        unit="°"
        .label=${`${label}: ${t("printer.set_target")}`}
        @yvz-change=${(e: CustomEvent<{ value: number }>) => this.onSet(e, temp.target, e.detail.value)}
      ></yvz-number-field>
      <yvz-icon-button
        raised
        icon="mdi:minus"
        .label=${`${label}: ${t("common.decrease")}`}
        @click=${(e: Event) => this.onAdjust(e, temp.target, -step)}
      ></yvz-icon-button>
      <yvz-icon-button
        raised
        icon="mdi:plus"
        .label=${`${label}: ${t("common.increase")}`}
        @click=${(e: Event) => this.onAdjust(e, temp.target, step)}
      ></yvz-icon-button>
    </div>${heating ? this.renderTrend(temp.actual) : nothing}</div>`;
  }

  private renderTrend(entity: string) {
    return html`<yvz-sparkline class="trend" .hass=${this.hass} .entity=${entity} unit="°" .hours=${1} .height=${22} .locale=${this.hass!.locale?.language ?? ""}></yvz-sparkline>`;
  }

  private renderOff(): TemplateResult {
    const t = this.t;
    return html`<yvz-confirm-button
      style="--yvz-state: var(--yvz-accent)"
      icon="mdi:power"
      tone="default"
      .label=${t("printer.turn_on")}
      .confirmLabel=${t("printer.tap_again_on")}
      @yvz-confirm=${(e: Event) => this.run(e, this.script(this.cfg.scripts.power_on))}
    ></yvz-confirm-button>`;
  }

  private renderReady(): TemplateResult {
    const t = this.t;
    const { scripts, hotend, bed } = this.cfg;
    const button = (icon: string, label: string, action: (e: Event) => void) =>
      html`<yvz-button outline .icon=${icon} @click=${action}>${label}</yvz-button>`;
    const custom = this.cfg.presets?.filter((p) => p.name);
    const presets = custom?.length
      ? custom.map((p) => button(p.icon ?? "mdi:printer-3d-nozzle-heat", p.name, (e) => this.onPreset(e, p)))
      : [
          button("mdi:printer-3d-nozzle-heat", t("printer.pla"), (e) => this.run(e, this.script(scripts.preheat_pla))),
          button("mdi:printer-3d-nozzle-heat", t("printer.petg"), (e) => this.run(e, this.script(scripts.preheat_petg))),
        ];
    const done = this.finished;
    return html`
      ${done
        ? html`<yvz-note icon="mdi:check-circle-outline"
            >${done.took === undefined
              ? t("printer.finished", { time: formatTime(this.hass!, done.at) })
              : t("printer.finished_took", { time: formatTime(this.hass!, done.at), took: formatDuration(t, done.took) })}</yvz-note
          >`
        : nothing}
      <div class="presets">${presets}${button("mdi:snowflake", t("printer.cooldown"), (e) => this.run(e, this.script(scripts.cooldown)))}</div>
      <div class="lines">${this.renderTemperature(t("printer.hotend"), hotend, HOTEND_MAX)}${this.renderTemperature(t("printer.bed"), bed, BED_MAX)}</div>
      <yvz-confirm-button
        icon="mdi:power"
        .label=${t("printer.power_off")}
        .confirmLabel=${t("common.confirm")}
        @yvz-confirm=${(e: Event) => this.run(e, this.script(scripts.power_off))}
      ></yvz-confirm-button>
    `;
  }

  private renderPrinting(mode: PrinterMode): TemplateResult {
    const t = this.t;
    const c = this.cfg;
    const pct = Math.min(100, Math.max(0, this.num(c.progress) ?? 0));
    const file = this.raw(c.file);
    const fileName = file && !UNAVAILABLE.includes(file) ? file.replace(/\.(gcode|gco|g)$/i, "") : "—";
    const finish = Date.parse(this.raw(c.finish) ?? "");
    const remaining = !Number.isNaN(finish) && finish > Date.now() ? formatDuration(t, finish - Date.now()) : "";
    const stat = (label: string, temp: { actual: string; target: string }) => html`<div class="stat">
      <yvz-gauge
        variant="stat"
        .label=${label}
        .value=${this.num(temp.actual)}
        .display=${`${this.deg(temp.actual)} / ${this.deg(temp.target)}`}
      ></yvz-gauge>
      ${this.renderTrend(temp.actual)}
    </div>`;
    const start = Date.parse(this.raw(c.start) ?? "");
    const elapsed = !Number.isNaN(start) && start < Date.now() ? Date.now() - start : undefined;
    return html`
      <div class="progress">
        <yvz-progress .value=${pct}></yvz-progress>
        <div class="meta"><span class="file">${fileName}</span>${remaining ? html`<b>${t("printer.remaining", { time: remaining })}</b>` : nothing}</div>
        ${elapsed === undefined
          ? nothing
          : html`<div class="since">${t("printer.started", { time: formatTime(this.hass!, start) })} · ${t("printer.elapsed", { time: formatDuration(t, elapsed) })}</div>`}
      </div>
      <div class="temps">${stat(t("printer.hotend"), c.hotend)}${stat(t("printer.bed"), c.bed)}</div>
      <div class="actions">
        ${mode === "pause"
          ? html`<yvz-button outline icon="mdi:play" @click=${(e: Event) => this.run(e, this.press(c.buttons.resume))}>${t("printer.resume")}</yvz-button>`
          : html`<yvz-button outline icon="mdi:pause" @click=${(e: Event) => this.run(e, this.press(c.buttons.pause))}>${t("printer.pause")}</yvz-button>`}
        <yvz-confirm-button
          icon="mdi:stop"
          .label=${t("printer.stop")}
          .confirmLabel=${t("common.confirm")}
          @yvz-confirm=${(e: Event) => this.run(e, this.press(c.buttons.stop))}
        ></yvz-confirm-button>
      </div>
    `;
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    const t = this.t;
    const c = this.cfg;
    const mode = this.mode;
    const printing = mode === "print" || mode === "pause";
    const pct = Math.min(100, Math.max(0, this.num(c.progress) ?? 0));
    const finish = Date.parse(this.raw(c.finish) ?? "");
    const clock = mode === "print" && !Number.isNaN(finish) ? formatTime(this.hass, finish) : "";

    // The plate stays hot long after a print; a quiet warning for whoever reaches for it.
    const bed = this.num(c.bed.actual);
    const bedHot = !printing && bed !== undefined && bed > c.bed_safe;

    let body: TemplateResult | typeof nothing = nothing;
    if (mode === "off") body = this.renderOff();
    else if (mode === "wait") body = html`<yvz-note icon="mdi:timer-sand">${t("printer.wait_note")}</yvz-note>`;
    else if (printing) body = this.renderPrinting(mode);
    else body = this.renderReady();

    return html`<ha-card data-state=${ROLES[mode]}>
      <yvz-card-header
        .icon=${mode === "off" ? "mdi:printer-3d-off" : "mdi:printer-3d"}
        .heading=${c.name ?? t("printer.default_name")}
        .subtitle=${this.statusText(mode)}
      >
        ${clock ? html`<yvz-chip slot="end" icon="mdi:clock-outline">${clock}</yvz-chip>` : nothing}
      </yvz-card-header>
      ${mode === "error" ? html`<yvz-banner tone="error">${t("printer.error_banner")}</yvz-banner>` : nothing}
      <div class="main">
        <yvz-camera
          class="camera"
          .src=${this.cameraSrc}
          .label=${t("printer.no_image")}
          @click=${() => fireMoreInfo(this, c.camera)}
          @yvz-retry=${() => this.refreshCamera()}
        >
          ${printing ? html`<span slot="overlay">${Math.round(pct)}%</span>` : nothing}
        </yvz-camera>
        <div class="body">
          ${body}
          ${bedHot ? html`<yvz-note tone="warning" icon="mdi:thermometer-alert">${t("printer.bed_hot", { temp: `${Math.round(bed)}°` })}</yvz-note>` : nothing}
        </div>
      </div>
    </ha-card>`;
  }

  static override styles: CSSResultGroup = [
    YvzCard.styles,
    css`
      ha-card {
        container-type: inline-size;
      }

      yvz-banner {
        margin-top: var(--yvz-space-3);
      }

      /* the picture and the controls sit together, centred in whatever height the card has */
      .main {
        display: flex;
        flex: 1;
        flex-direction: column;
        justify-content: center;
        gap: var(--yvz-space-4);
        margin-top: var(--yvz-space-3);
      }

      .camera {
        max-height: 260px;
        width: 100%;
        cursor: pointer;
      }

      .body {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-3);
        min-width: 0;
      }

      .presets {
        display: grid;
        gap: var(--yvz-space-2);
      }

      .lines {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-4);
        --yvz-icon-button-size: 36px;
      }

      /* the same columns in every row, so the labels, the measured values and the targets line up */
      .line {
        display: grid;
        grid-template-columns: 4.5rem 4ch auto minmax(0, 1fr) auto auto;
        align-items: center;
        column-gap: var(--yvz-space-2);
      }

      .line .name {
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-body);
      }

      .line .now {
        font-size: var(--yvz-text-body);
        font-variant-numeric: tabular-nums;
        font-weight: var(--yvz-weight-medium);
        text-align: end;
      }

      .line .to {
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
      }

      .line yvz-number-field {
        justify-self: start;
        margin-inline-start: calc(var(--yvz-space-2) * -1);
      }

      .temp,
      .stat {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-2);
        min-width: 0;
      }

      .trend {
        --yvz-state: var(--yvz-text-muted);
      }

      .since {
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        font-variant-numeric: tabular-nums;
      }

      .presets {
        grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
      }

      .progress {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-2);
      }

      .meta {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--yvz-space-2);
        font-size: var(--yvz-text-body);
      }

      .meta .file {
        min-width: 0;
        overflow: hidden;
        color: var(--yvz-text-muted);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .meta b {
        font-variant-numeric: tabular-nums;
        font-weight: var(--yvz-weight-medium);
        white-space: nowrap;
      }

      .temps {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--yvz-space-4);
      }

      .actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--yvz-space-2);
      }

      /* wide: the picture on the left, the controls on the right */
      @container (min-width: 640px) {
        .main {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
          align-content: center;
          align-items: center;
          gap: var(--yvz-space-6);
        }

        .camera {
          max-height: none;
        }
      }
    `,
  ];
}

registerCard({
  type: "yvz-printer-card",
  name: "YVZ Printer",
  description: "3D printer with a live camera: printing, ready and off, with preheat, pause and stop.",
});

declare global {
  interface HTMLElementTagNameMap {
    "yvz-printer-card": YvzPrinterCard;
  }
}
