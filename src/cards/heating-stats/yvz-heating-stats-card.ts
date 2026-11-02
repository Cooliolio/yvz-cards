import { css, html, nothing, type CSSResultGroup, type TemplateResult } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import "../../design";
import { initialOf, NEUTRAL, userColors, type Pin } from "../../design/pins";
import type { Bar, SegmentOption, StatTrend } from "../../design";
import { formatDuration, formatNumber, formatTime } from "../../shared/format";
import { haptic } from "../../shared/haptic";
import type { TranslationKey } from "../../shared/i18n";
import { registerCard } from "../../shared/register-card";
import { TickController } from "../../shared/tick-controller";
import type { LovelaceCardConfig } from "../../shared/types";
import { YvzCard } from "../../shared/yvz-card";
import { AT_TARGET_TOLERANCE, HUMIDITY_WARN, hoursPerDegreeDay, seasonStart } from "./efficiency";
import { personNames } from "./events";
import { humidityOf } from "./humidity";
import { DAY, HOUR, loadStats, MAX_EVENTS, type StatsData, type StatsEntities, type Totals } from "./history";
import { loadSeason, type Season } from "./season";
import { ACCENT_TILES, tileColumns, tilesFor, type TileKey } from "./tiles";
import "./yvz-heating-stats-card-editor";
import {
  PERIODS,
  STATS_ENTITIES,
  TARGET_KEYS,
  STATS_LONG_TERM,
  type HeatingStatsConfig,
  type Period,
  type StatsEntityKey,
  type StatsLongTermKey,
} from "./types";

const REFRESH_MS = 5 * 60_000;
// A pump flip refreshes the numbers, but never more often than this.
const MIN_GAP_MS = 20_000;
const FLAT = 0.05;
// From this card width the card goes two columns and lists more events.
const WIDE_PX = 900;
const EVENTS_NARROW = 5;
const EVENTS_WIDE = 8;
// A day only counts towards the average when the recorder has history for it, and the average needs a few of them.
const MIN_DAYS_FOR_AVERAGE = 3;
// The run chart fills spare height in a panel, but never grows taller than this.
const MAX_PLOT_PX = 300;
const ARM_MS = 3000;
// The season figures cover months of history, so they are fetched far less often than the rest.
const SEASON_REFRESH_MS = 30 * 60_000;
// The daily bars never scale below this, so one active day doesn't fill the chart.
const MIN_BAR_SCALE_H = 1;
const MODE_KEYS: Record<string, TranslationKey> = {
  Off: "heating.off",
  On: "heating.on",
  Eco: "heating.eco",
  Comfort: "heating.comfort",
  Boost: "heating.boost",
};

const storageKey = (config: HeatingStatsConfig): string =>
  `yvz-heating-stats:${config.name ?? config.climate ?? "default"}:period`;

function loadPeriod(config: HeatingStatsConfig): Period {
  try {
    const saved = localStorage.getItem(storageKey(config));
    if (PERIODS.includes(saved as Period)) return saved as Period;
  } catch {
    // Blocked storage just means the choice isn't remembered.
  }
  return config.period && PERIODS.includes(config.period) ? config.period : "today";
}

interface Figure {
  label: string;
  value: string;
  delta?: string;
  trend?: StatTrend;
  note?: string;
  title?: string;
}

interface Comparison {
  before: Totals;
  runtimeBefore: number;
  startsBefore: number;
  // Whether there is anything to compare with.
  available: boolean;
  // "compared with yesterday until 19:49"
  text: string;
}

@customElement("yvz-heating-stats-card")
export class YvzHeatingStatsCard extends YvzCard<HeatingStatsConfig> {
  @state() private period: Period = "today";
  @state() private data?: StatsData;
  @state() private plotHeight = 140;
  @state() private wide = false;
  @state() private kpiWidth = 0;
  @state() private eventsExpanded = false;
  @state() private season?: Season;
  // The room waiting for its second tap before it becomes the leading one.
  @state() private armedRoom?: string;
  @query(".plot") private plot?: HTMLElement;
  @query(".kpis") private kpis?: HTMLElement;

  private cache = new Map<Period, StatsData>();
  private loading = false;
  private lastFetch = 0;
  private observer?: ResizeObserver;
  private watched: Element[] = [];
  private seasonKey = "";
  private seasonAt = 0;
  private seasonLoading = false;
  private armTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    super();
    new TickController(this, 60_000);
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("yvz-heating-stats-card-editor");
  }

  static getStubConfig(): Partial<HeatingStatsConfig> {
    return {};
  }

  setConfig(config: LovelaceCardConfig): void {
    if (!config || typeof config !== "object") throw new Error("yvz-heating-stats-card: invalid configuration");
    this.config = config as HeatingStatsConfig;
    this.period = loadPeriod(this.config);
    this.cache.clear();
    this.data = undefined;
    this.season = undefined;
    this.seasonKey = "";
    this.seasonAt = 0;
  }

  override getCardSize(): number {
    return this.config?.compact ? 3 : 9;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.observer = new ResizeObserver(() => this.measure());
    this.observer.observe(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.observer?.disconnect();
    this.watched = [];
    clearTimeout(this.armTimer);
  }

  // The card's own width decides one or two columns and how many events fit; the run chart takes the spare height.
  private measure(): void {
    this.wide = this.clientWidth >= WIDE_PX;
    const kpis = this.kpis?.clientWidth ?? 0;
    if (kpis > 0 && kpis !== this.kpiWidth) this.kpiWidth = kpis;
    const height = this.plot?.clientHeight ?? 0;
    if (height > 0) this.plotHeight = Math.min(MAX_PLOT_PX, Math.max(120, Math.round(height - 18)));
  }

  protected override updated(): void {
    const next = [this.plot, this.kpis].filter((e): e is HTMLElement => !!e);
    if (next.length === this.watched.length && next.every((e, i) => e === this.watched[i])) return;
    this.watched.forEach((e) => this.observer?.unobserve(e));
    this.watched = next;
    next.forEach((e) => this.observer?.observe(e));
    this.measure();
  }

  /* ---------- entities ---------- */

  private entityId(key: StatsEntityKey): string {
    return this.config?.[key] ?? STATS_ENTITIES[key];
  }

  private longTerm(key: StatsLongTermKey): number | undefined {
    const st = this.hass?.states[this.config?.[key] ?? STATS_LONG_TERM[key]];
    // Only a real number counts; "unavailable", "unknown" and an empty state fall back to the history.
    const n = st && st.state.trim() !== "" ? Number(st.state) : NaN;
    if (!st || !Number.isFinite(n)) return undefined;
    if (!key.startsWith("runtime")) return n;
    const unit = String(st.attributes.unit_of_measurement ?? "h");
    return n * (unit === "min" ? 60_000 : unit === "s" ? 1000 : HOUR);
  }

  private get entities(): StatsEntities {
    return {
      pump: this.entityId("pump"),
      control: this.entityId("control"),
      climate: this.entityId("climate"),
      trend: this.entityId("trend"),
      mode: this.entityId("mode"),
      leading: this.entityId("leading"),
      outdoor: this.config?.outdoor || undefined,
      sensors: this.entityId("sensors"),
      warnings: {
        offline: this.entityId("offline"),
        no_warmup: this.entityId("no_warmup"),
        sensor_problem: this.entityId("sensor_problem"),
        battery_low: this.entityId("battery_low"),
      },
      targets: Object.fromEntries(TARGET_KEYS.map((k) => [k, this.entityId(k)])) as StatsEntities["targets"],
    };
  }

  private get roomMap(): Record<string, string> {
    return (this.hass?.states[this.entityId("sensors")]?.attributes.map ?? {}) as Record<string, string>;
  }

  /* ---------- data ---------- */

  protected override willUpdate(): void {
    if (!this.config || !this.hass) return;
    this.data = this.cache.get(this.period);
    const pumpChanged = this.hass.states[this.entityId("pump")]?.last_changed ?? "";
    const data = this.data;
    const outdated = !data || Date.now() - data.fetchedAt > REFRESH_MS || data.pumpChanged !== pumpChanged;
    const urgent = !data;
    if (outdated && !this.loading && (urgent || Date.now() - this.lastFetch > MIN_GAP_MS)) void this.refresh();
    this.refreshSeason();
  }

  // Pump hours per degree-day of the season needs the outdoor temperature; it is looked at now and then.
  private refreshSeason(): void {
    const outdoor = this.config?.outdoor;
    if (!outdoor || !this.hass || this.seasonLoading) return;
    const key = `${outdoor}|${this.entityId("pump")}|${this.config?.season_start ?? ""}`;
    if (key === this.seasonKey && Date.now() - this.seasonAt < SEASON_REFRESH_MS) return;
    void this.loadSeasonData(key, outdoor);
  }

  private async loadSeasonData(key: string, outdoor: string): Promise<void> {
    const hass = this.hass;
    if (!hass) return;
    this.seasonLoading = true;
    this.seasonKey = key;
    this.seasonAt = Date.now();
    try {
      const now = Date.now();
      this.season = await loadSeason(hass, this.entityId("pump"), outdoor, seasonStart(this.config?.season_start, now), now);
    } catch {
      this.season = undefined;
    } finally {
      this.seasonLoading = false;
    }
  }

  private async refresh(): Promise<void> {
    const hass = this.hass;
    if (!hass) return;
    const period = this.period;
    this.loading = true;
    this.lastFetch = Date.now();
    try {
      const data = await loadStats(hass, this.entities, this.roomMap, period, Date.now(), {
        showUser: this.config?.show_user !== false,
        targetEvents: this.config?.target_events !== false,
      });
      this.cache.set(period, data);
      if (period === this.period) this.data = data;
    } finally {
      this.loading = false;
    }
  }

  private pick(period: Period): void {
    this.period = period;
    try {
      localStorage.setItem(storageKey(this.config!), period);
    } catch {
      // Not remembered, but the switch still works.
    }
  }

  /* ---------- formatting ---------- */

  private duration(ms: number): string {
    return formatDuration(this.t, Math.round(ms / 60_000) * 60_000);
  }

  private temp(v: number | undefined, digits = 1): string {
    return v == null ? "–" : `${formatNumber(this.hass!, v, { minimumFractionDigits: digits, maximumFractionDigits: digits })}°`;
  }

  private get language(): string {
    return this.hass!.locale?.language ?? this.hass!.language;
  }

  // "Today 18:16", "Yesterday 22:30", "Mon 01:00", and a date once it is more than a week old.
  private when(t: number): string {
    const hass = this.hass!;
    const midnight = new Date().setHours(0, 0, 0, 0);
    const time = formatTime(hass, t);
    if (t >= midnight) return `${this.t("hstats.period.today")} ${time}`;
    if (t >= midnight - DAY) return `${this.t("hstats.yesterday")} ${time}`;
    const day =
      t >= midnight - 6 * DAY
        ? new Intl.DateTimeFormat(this.language, { weekday: "short" }).format(t)
        : new Intl.DateTimeFormat(this.language, { day: "numeric", month: "short" }).format(t);
    return `${day} ${time}`;
  }

  private trendOf(delta: number, flat = 0): StatTrend {
    return delta > flat ? "up" : delta < -flat ? "down" : "flat";
  }

  // Hours as "3.4 h", shorter runs as minutes.
  private shortHours(ms: number): string {
    const t = this.t;
    if (ms <= 0) return "";
    if (ms < HOUR) return t("common.minutes_short", { count: Math.max(1, Math.round(ms / 60_000)) });
    return t("common.hours_short", { count: formatNumber(this.hass!, ms / HOUR, { maximumFractionDigits: 1 }) });
  }

  /* ---------- comparison ---------- */

  // Today is compared with yesterday up to the same time of day, or all of yesterday (`compare: full_day`).
  private comparison(d: StatsData): Comparison {
    const t = this.t;
    const p = this.period;
    const fullDay = p === "today" && this.config?.compare === "full_day";
    const before = fullDay ? d.prevFull : d.prev;
    const runtimeBefore = fullDay ? (this.longTerm("runtime_yesterday") ?? before.runtime) : before.runtime;
    const startsBefore = fullDay ? (this.longTerm("starts_yesterday") ?? before.starts) : before.starts;
    const available = runtimeBefore > 0 || startsBefore > 0;
    const text =
      p === "today"
        ? fullDay
          ? t("hstats.vs.full_day")
          : t("hstats.vs.same_time", { time: formatTime(this.hass!, Date.now()) })
        : t(`hstats.vs.${p}` as TranslationKey);
    return { before, runtimeBefore, startsBefore, available, text };
  }

  /* ---------- render pieces ---------- */

  // The first four key figures. `names` puts the coldest and warmest room's name in the tile; the wide strip
  // leaves them for the tooltip and shows the temperatures only.
  private baseFigures(d: StatsData, c: Comparison, names: boolean): Record<"runtime" | "starts" | "longest" | "avg", Figure> {
    const t = this.t;
    const hass = this.hass!;
    const runtime = this.longTerm(`runtime_${this.period}` as StatsLongTermKey) ?? d.runtime;
    const starts = this.longTerm(`starts_${this.period}` as StatsLongTermKey) ?? d.starts;

    const enough = (ms: number) => Math.abs(ms) >= 60_000;
    const durationDelta = (now: number, before: number) =>
      enough(now - before) ? { delta: this.duration(Math.abs(now - before)), trend: this.trendOf(now - before) } : { delta: "", trend: "flat" as StatTrend };
    const rt = durationDelta(runtime, c.runtimeBefore);
    const lr = durationDelta(d.longest, c.before.longest);
    const startsDiff = starts - c.startsBefore;
    const tempDiff = d.avgTemp != null && c.before.avgTemp != null ? d.avgTemp - c.before.avgTemp : undefined;
    // Share of the elapsed time the pump ran, e.g. "38 % of the time".
    const duty = d.elapsed > 0 ? Math.min(100, Math.round((runtime / d.elapsed) * 100)) : undefined;

    // The tile is the leading room, not the house: say which room, and show how far the others are from it.
    const leaders = d.leaders;
    const lead = leaders?.main ?? hass.states[this.entityId("leading")]?.state;
    const label = !lead
      ? t("hstats.avg_temp")
      : leaders && leaders.others > 0
        ? t("hstats.avg_rooms_more", { room: lead, count: leaders.others })
        : t("hstats.avg_room", { room: lead });
    const known = d.rooms.filter((r) => r.current != null);
    const cold = known.length > 1 ? known.reduce((a, b) => (b.current! < a.current! ? b : a)) : undefined;
    const warm = known.length > 1 ? known.reduce((a, b) => (b.current! > a.current! ? b : a)) : undefined;
    const spread = cold && warm && cold.current !== warm.current ? { cold: `${cold.name} ${this.temp(cold.current)}`, warm: `${warm.name} ${this.temp(warm.current)}` } : undefined;
    const title = [leaders && leaders.others > 0 ? t("hstats.avg_room_title") : t("hstats.avg_room_only"), spread ? t("hstats.spread_title", spread) : ""]
      .filter(Boolean)
      .join(" ");
    const spreadNote = !spread ? "" : names ? t("hstats.spread", spread) : `${this.temp(cold!.current)} – ${this.temp(warm!.current)}`;

    return {
      runtime: {
        label: t("hstats.runtime"),
        value: this.duration(runtime),
        delta: c.available ? rt.delta : "",
        trend: rt.trend,
        note: duty == null ? "" : t("hstats.duty", { percent: formatNumber(hass, duty) }),
      },
      starts: {
        label: t("hstats.starts"),
        value: formatNumber(hass, starts),
        delta: c.available && startsDiff !== 0 ? formatNumber(hass, Math.abs(startsDiff)) : "",
        trend: this.trendOf(startsDiff),
      },
      avg: {
        label,
        title,
        note: spreadNote,
        value: d.avgTemp == null ? "–" : this.temp(d.avgTemp),
        delta: tempDiff != null && Math.abs(tempDiff) >= FLAT ? this.temp(Math.abs(tempDiff)) : "",
        trend: tempDiff == null ? "flat" : this.trendOf(tempDiff, FLAT),
      },
      longest: {
        label: t("hstats.longest"),
        value: d.longest ? this.duration(d.longest) : "–",
        delta: c.available && d.longest ? lr.delta : "",
        trend: lr.trend,
      },
    };
  }

  // The figures from outside data and the thermostat; each is undefined when its data is missing.
  private extraFigures(d: StatsData): Partial<Record<TileKey, Figure>> {
    const t = this.t;
    const hass = this.hass!;
    const out: Partial<Record<TileKey, Figure>> = {};
    const hours = (h: number) => t("common.hours_short", { count: formatNumber(hass, h, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });

    if (this.config?.outdoor && d.degreeDays !== undefined) {
      out.degree_days = {
        label: t("hstats.degree_days"),
        value: formatNumber(hass, d.degreeDays, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        note: t("hstats.dd_note", { base: 18 }),
      };
      const now = hoursPerDegreeDay(d.runtime, d.degreeDays);
      const season = this.season;
      const seasonHours = season ? hoursPerDegreeDay(season.pumpMs, season.degreeDays) : undefined;
      out.per_degree_day = {
        label: t("hstats.per_degree_day"),
        value: now === undefined ? "–" : hours(now),
        note: [
          now === undefined ? t("hstats.too_mild_short") : "",
          seasonHours === undefined ? "" : t("hstats.season_pdd", { value: hours(seasonHours) }),
        ]
          .filter(Boolean)
          .join(" · "),
        title: [
          now === undefined ? t("hstats.too_mild") : "",
          season ? t("hstats.since", { date: new Intl.DateTimeFormat(this.language, { day: "numeric", month: "short" }).format(season.from) }) : "",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }
    if (d.atTarget !== undefined) {
      out.at_target = {
        label: t("hstats.at_target"),
        value: `${formatNumber(hass, Math.round(d.atTarget * 100))} %`,
        note: t("hstats.at_target_note", { tolerance: formatNumber(hass, AT_TARGET_TOLERANCE, { maximumFractionDigits: 1 }) }),
        title: t("hstats.at_target_title"),
      };
    }
    if (d.heatingRate !== undefined) {
      const climate = hass.states[this.entityId("climate")];
      const setpoint = Number(climate?.attributes.temperature);
      const current = parseFloat(hass.states[this.entityId("control")]?.state ?? "");
      const trend = parseFloat(hass.states[this.entityId("trend")]?.state ?? "");
      const gap = setpoint - current;
      const heating = hass.states[this.entityId("pump")]?.state === "on";
      // Only an estimate while the room is actually warming towards its target.
      const eta = heating && gap > 0.1 && trend > 0 ? Math.round((gap / trend) * 60) : undefined;
      const w = d.lastWarmUp;
      out.rate = {
        label: t("hstats.heating_rate"),
        value: `${formatNumber(hass, d.heatingRate, { maximumFractionDigits: 1 })} °/h`,
        note: [
          w ? t("hstats.warmup_note", { from: this.temp(w.from), to: this.temp(w.to), minutes: t("common.minutes_short", { count: w.minutes }) }) : "",
          eta == null ? "" : t("hstats.eta_note", { minutes: t("common.minutes_short", { count: eta }) }),
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }
    return out;
  }

  private stat(f: Figure, extra: { accent?: boolean; wrap?: boolean } = {}): TemplateResult {
    return html`<yvz-stat
      title=${f.title || nothing}
      .label=${f.label}
      .value=${f.value}
      .delta=${f.delta ?? ""}
      .trend=${f.trend ?? "flat"}
      .note=${f.note ?? ""}
      ?accent=${extra.accent}
      ?wrap=${extra.wrap}
    ></yvz-stat>`;
  }

  // The compact layout's four tiles, as they have always been.
  private renderTiles(d: StatsData, c: Comparison): TemplateResult {
    const f = this.baseFigures(d, c, true);
    return html`<div class="tiles">${this.stat(f.runtime)} ${this.stat(f.starts)} ${this.stat(f.avg)} ${this.stat(f.longest)}</div>`;
  }

  // The wide layout's strip: up to eight tiles, only those whose data exists, in columns that fill evenly.
  private renderKpis(d: StatsData, c: Comparison): TemplateResult {
    const base = this.baseFigures(d, c, false);
    const extra = this.extraFigures(d);
    const keys = tilesFor({ outdoor: !!this.config?.outdoor, degreeDays: d.degreeDays, atTarget: d.atTarget, heatingRate: d.heatingRate });
    const cols = tileColumns(keys.length, this.kpiWidth || 1000);
    return html`<div class="kpis" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr))">
      ${keys.map((key) => {
        const figure = key in base ? base[key as keyof typeof base] : extra[key];
        return figure ? this.stat(figure, { accent: ACCENT_TILES.includes(key), wrap: true }) : nothing;
      })}
    </div>`;
  }

  // Every change a person or an automation made inside the window, as timeline pins.
  private pinsOf(d: StatsData): Pin[] {
    if (this.config?.show_user === false) return [];
    const t = this.t;
    const names = personNames(this.hass!.states);
    const colors = userColors([...names.keys(), ...d.events.flatMap((e) => (e.userId ? [e.userId] : []))]);
    return d.events
      .filter((e) => (e.kind === "mode" || e.kind === "target") && (e.userId || e.auto !== undefined))
      .map((e, i) => {
        const name = e.userId ? names.get(e.userId) : undefined;
        const auto = e.userId ? undefined : e.auto;
        return {
          id: `${e.t}:${e.entity ?? e.key}:${i}`,
          t: e.t,
          text: this.eventText(e),
          who: e.userId ? (name ?? t("hstats.unknown_user")) : auto ? t("hstats.auto_by", { name: auto }) : t("hstats.auto"),
          when: this.when(e.t),
          initial: e.userId ? (name ? initialOf(name) : "?") : initialOf(t("hstats.auto")),
          color: e.userId && name ? (colors.get(e.userId) ?? NEUTRAL) : NEUTRAL,
        };
      });
  }

  private renderTimeline(d: StatsData): TemplateResult {
    const t = this.t;
    const pins = this.pinsOf(d);
    return html`<section class="plot-section panel">
      <yvz-section-title>
        ${t("hstats.timeline")}
        <span slot="end" class="legend">
          <i class="swatch run"></i>${t("hstats.legend_pump")}<i class="swatch line"></i>${t("hstats.legend_temp")}
          ${d.setpoint.length ? html`<i class="swatch dash"></i>${t("hstats.legend_setpoint")}` : nothing}
          ${d.outdoor.length ? html`<i class="swatch out"></i>${t("hstats.outside")}` : nothing}
          ${pins.length ? html`<i class="swatch who"></i>${t("hstats.who_legend")}` : nothing}
        </span>
      </yvz-section-title>
      <div class="plot">
        <yvz-timeline
          .from=${d.window.from}
          .to=${d.window.to}
          .runs=${d.intervals}
          .setpoint=${d.setpoint}
          .outdoor=${d.outdoor}
          outdoor-label=${t("hstats.outside")}
          .pins=${pins}
          pins-label=${t("hstats.who_legend")}
          .clusterText=${(count: number, until: number) => t("hstats.pin_cluster", { count, time: formatTime(this.hass!, until) })}
          .temperature=${d.temperature}
          .height=${this.plotHeight}
          .locale=${this.language}
        ></yvz-timeline>
      </div>
    </section>`;
  }

  private renderDays(d: StatsData, panel = false): TemplateResult {
    const t = this.t;
    const month = this.period === "month";
    const last = d.days.length - 1;
    const bars: Bar[] = d.days.map((day, i) => ({
      label: month ? String(new Date(day.start).getDate()) : new Intl.DateTimeFormat(this.language, { weekday: "short" }).format(day.start),
      value: day.runtime / HOUR,
      display: day.runtime <= 0 ? t("hstats.day_off") : this.shortHours(day.runtime),
      text: [
        `${new Intl.DateTimeFormat(this.language, { weekday: "short", day: "numeric", month: "short" }).format(day.start)}: ${
          day.runtime <= 0 && i !== last ? t("hstats.day_off_all") : this.duration(day.runtime)
        }`,
        d.dayOutdoor[i] == null ? "" : `${t("hstats.outside")} ${this.temp(d.dayOutdoor[i], 0)}`,
      ]
        .filter(Boolean)
        .join(" · "),
      empty: day.runtime <= 0,
      sub: d.dayOutdoor[i] == null ? undefined : this.temp(d.dayOutdoor[i], 0),
      current: i === last,
      // Today isn't over yet, so its bar will still grow.
      partial: i === last,
    }));
    // The average only counts finished days that have history, and only once there are a few of them.
    const finished = d.days.slice(0, -1);
    const counted = finished.slice(finished.length - d.finishedWithData);
    const average = d.finishedWithData >= MIN_DAYS_FOR_AVERAGE ? counted.reduce((n, x) => n + x.runtime, 0) / counted.length : 0;
    // The wide layout puts the season next to the daily average; the compact one keeps it on a line below.
    const end = [average > 0 ? t("hstats.per_day", { time: this.duration(average) }) : "", panel ? this.seasonText() : ""].filter(Boolean).join(" · ");
    return html`<section class=${panel ? "panel" : nothing}>
      <yvz-section-title class="wrap">
        ${t("hstats.daily")}
        <span slot="end">${end}</span>
      </yvz-section-title>
      <yvz-bars
        class="days"
        .bars=${bars}
        .max=${MIN_BAR_SCALE_H}
        .height=${this.config?.compact ? 88 : 104}
      ></yvz-bars>
    </section>`;
  }

  // The season sensors, when they exist: "Season: 142 h, 85 starts, 6 min per start".
  private seasonText(): string {
    const t = this.t;
    const runtime = this.longTerm("runtime_season");
    const starts = this.longTerm("starts_season");
    const perStart = runtime != null && starts != null && starts > 0 ? Math.round(runtime / 60_000 / starts) : undefined;
    const parts = [
      runtime == null ? null : t("common.hours_short", { count: formatNumber(this.hass!, Math.round(runtime / HOUR)) }),
      starts == null ? null : t("hstats.season_starts", { count: formatNumber(this.hass!, Math.round(starts)) }),
      perStart == null ? null : t("hstats.season_per_start", { minutes: formatNumber(this.hass!, perStart) }),
    ].filter(Boolean);
    return parts.length ? `${t("hstats.season")}: ${parts.join(", ")}` : "";
  }

  private renderSeason(): TemplateResult | typeof nothing {
    const text = this.seasonText();
    return text ? html`<p class="season">${text}</p>` : nothing;
  }

  private onRoom(name: string, lead: string | undefined): void {
    if (name === lead) return;
    clearTimeout(this.armTimer);
    if (this.armedRoom !== name) {
      haptic("selection");
      this.armedRoom = name;
      this.armTimer = setTimeout(() => (this.armedRoom = undefined), ARM_MS);
      return;
    }
    this.armedRoom = undefined;
    haptic("success");
    void this.hass!.callService("input_select", "select_option", { entity_id: this.entityId("leading"), option: name });
  }

  private renderRooms(d: StatsData): TemplateResult {
    const t = this.t;
    const lead = this.hass!.states[this.entityId("leading")]?.state;
    const rows = [...d.rooms].sort((a, b) => a.name.localeCompare(b.name));
    // The gap to the target only means something while the heating has one.
    const setpoint = Number(this.hass!.states[this.entityId("climate")]?.attributes.temperature);
    const target = Number.isFinite(setpoint) && setpoint > 0 ? setpoint : undefined;
    const known = rows.filter((r) => r.current != null);
    const coldest = known.length > 1 ? known.reduce((a, b) => (b.current! < a.current! ? b : a)).name : undefined;
    const gap = new Intl.NumberFormat(this.language, { signDisplay: "exceptZero", minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return html`<section class="panel">
      <yvz-section-title>${t("hstats.rooms")}</yvz-section-title>
      ${rows.length
        ? html`<div class="rooms">
            ${rows.map((r) => {
              const diff = target != null && r.current != null ? r.current - target : undefined;
              const armed = this.armedRoom === r.name;
              const humidity = humidityOf(this.hass!, r.entity);
              const humid = humidity != null && humidity >= HUMIDITY_WARN;
              const humidityText = humidity == null ? "" : t(humid ? "hstats.humidity_high" : "hstats.humidity", { percent: formatNumber(this.hass!, Math.round(humidity)) });
              return html`<div
                class="room ${r.name === lead ? "lead" : ""} ${r.name === coldest ? "coldest" : ""} ${armed ? "armed" : ""}"
                role="button"
                tabindex="0"
                @click=${() => this.onRoom(r.name, lead)}
                @keydown=${(e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), this.onRoom(r.name, lead))}
              >
                <span class="name"
                  ><span class="title"
                    >${r.name}${r.name === lead ? html`<ha-icon icon="mdi:thermostat" title=${t("hstats.leading")}></ha-icon>` : nothing}${r.name === coldest
                      ? html`<ha-icon class="cold" icon="mdi:snowflake" title=${t("hstats.coldest")}></ha-icon>`
                      : nothing}</span
                  >${humidity == null
                    ? nothing
                    : html`<small class="hum ${humid ? "high" : ""}" title=${humidityText} aria-label=${humidityText}
                        >${humid ? html`<ha-icon icon="mdi:water-alert"></ha-icon>` : nothing}${formatNumber(this.hass!, Math.round(humidity))} %</small
                      >`}</span
                >
                ${armed
                  ? html`<span class="confirm">${t("hstats.set_leading")}</span>`
                  : html`<span class="gap ${diff != null && diff < 0 ? "below" : ""}">${diff == null ? "" : `${gap.format(diff)}°`}</span>
                      <span class="now">${this.temp(r.current)}</span>
                      <span class="range">${r.min == null ? "–" : `${this.temp(r.min)} – ${this.temp(r.max)}`}</span>
                      <yvz-sparkline
                        class="spark"
                        .values=${r.values.length > 1 && r.values.every((v) => !Number.isNaN(v)) ? r.values : undefined}
                        .from=${d.window.from}
                        .to=${d.window.to}
                        .height=${24}
                        unit="°"
                      ></yvz-sparkline>`}
              </div>`;
            })}
          </div>`
        : html`<p class="hint">${t("heating.no_rooms")}</p>`}
    </section>`;
  }

  // Who or what made the change, as short text for the line and the longer text for its tooltip.
  private origin(e: StatsData["events"][number], names: Map<string, string>): { short: string; long: string } {
    if (this.config?.show_user === false) return { short: "", long: "" };
    const t = this.t;
    if (e.userId) {
      const name = names.get(e.userId) ?? "";
      return { short: name, long: name };
    }
    if (e.auto !== undefined) return { short: t("hstats.auto"), long: e.auto ? t("hstats.auto_by", { name: e.auto }) : t("hstats.auto") };
    return { short: "", long: "" };
  }

  // What happened, without who.
  private eventText(e: StatsData["events"][number]): string {
    const t = this.t;
    if (e.kind === "warning") return t(`hstats.event.${e.key}` as TranslationKey);
    if (e.kind === "run") return e.key === "short" ? t("hstats.event.short", { count: e.count ?? 0 }) : t("hstats.event.run", { time: this.duration(e.ms ?? 0) });
    if (e.kind === "target") return t(`hstats.event.set_${e.key}` as TranslationKey, { value: this.temp(e.value) });
    return t("hstats.mode_to", { mode: MODE_KEYS[e.key] ? t(MODE_KEYS[e.key]) : e.key });
  }

  private renderEvents(d: StatsData): TemplateResult {
    const t = this.t;
    const limit = this.wide ? EVENTS_WIDE : EVENTS_NARROW;
    // The data holds every event for the timeline's pins; the list stops at MAX_EVENTS.
    const all = d.events.slice(0, MAX_EVENTS);
    const events = this.eventsExpanded ? all : all.slice(0, limit);
    const names = personNames(this.hass!.states);
    return html`<section class="panel">
      <yvz-section-title>${t("hstats.events")}</yvz-section-title>
      ${events.length
        ? html`<ul class="events">
            ${events.map((e) => {
              // Short-cycling is a warning inside the run row, not a row of its own kind.
              const warning = e.kind === "warning" || e.key === "short";
              const text = this.eventText(e);
              const icon = warning
                ? "mdi:alert-outline"
                : e.kind === "run"
                  ? "mdi:radiator"
                  : e.kind === "target"
                    ? "mdi:thermometer"
                    : "mdi:swap-horizontal";
              const who = this.origin(e, names);
              const title = [text, who.long, e.kind === "target" && e.count && e.count > 1 ? t("hstats.changes", { count: e.count }) : ""].filter(Boolean).join(" · ");
              return html`<li data-state=${warning ? "pending" : nothing} title=${title}>
                <ha-icon .icon=${icon}></ha-icon>
                <span class="text">${text}${who.short ? html`<span class="who"> · ${who.short}</span>` : nothing}</span
                ><time>${this.when(e.t)}</time>
              </li>`;
            })}
          </ul>
          ${all.length > limit
            ? html`<button class="more" aria-expanded=${this.eventsExpanded} @click=${() => (this.eventsExpanded = !this.eventsExpanded)}>
                ${this.eventsExpanded ? t("hstats.show_less") : t("hstats.show_more")}
              </button>`
            : nothing}`
        : html`<p class="hint">${t("hstats.no_events")}</p>`}
    </section>`;
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    const t = this.t;
    const d = this.data;
    const compact = !!this.config.compact;
    const options: SegmentOption[] = PERIODS.map((value) => ({ value, label: t(`hstats.period.${value}` as TranslationKey) }));
    const days = this.period === "month" ? 30 : 7;
    const c = d ? this.comparison(d) : undefined;
    const subtitle = [t(`hstats.subtitle.${this.period}` as TranslationKey, { days }), c?.available ? c.text : ""].filter(Boolean).join(" · ");
    // A new install has little history, so the longer periods are labelled instead of looking wrong.
    const collecting = d && d.periodDays > 0 && d.dataDays < MIN_DAYS_FOR_AVERAGE && !d.empty;

    // On wide cards the period control sits in the header's right-hand corner; below that it goes under it.
    const inHeader = !compact && this.wide;
    const periods = html`<yvz-segmented
      outline
      class="periods ${inHeader ? "in-header" : ""}"
      slot=${inHeader ? "end" : nothing}
      .label=${t("hstats.period")}
      .options=${options}
      .value=${this.period}
      @yvz-select=${(e: CustomEvent<{ value: Period }>) => this.pick(e.detail.value)}
    ></yvz-segmented>`;

    return html`
      <ha-card class=${compact ? "compact" : ""}>
        <yvz-card-header icon="mdi:chart-line" .heading=${this.config.name ?? t("hstats.default_name")} .subtitle=${subtitle}>
          ${inHeader ? periods : nothing}
        </yvz-card-header>
        ${inHeader ? nothing : periods}
        ${!d || !c
          ? html`<p class="hint loading">${t("hstats.loading")}</p>`
          : html`
              ${d.empty ? html`<yvz-banner tone="info">${t("hstats.no_history")}</yvz-banner>` : nothing}
              ${collecting
                ? html`<yvz-banner tone="info" icon="mdi:database-clock-outline"
                    >${t("hstats.collecting", { days: d.dataDays, total: d.periodDays })}</yvz-banner
                  >`
                : nothing}
              <div class="body">
                ${compact
                  ? html`${this.renderTiles(d, c)} ${this.renderDays(d)} ${this.renderSeason()}`
                  : html`${this.renderKpis(d, c)}
                      <div class="main">
                        <div class="col left">${this.renderTimeline(d)} ${this.renderDays(d, true)}</div>
                        <div class="col right">${this.renderRooms(d)} ${this.renderEvents(d)}</div>
                      </div>`}
              </div>
            `}
      </ha-card>
    `;
  }

  static override styles: CSSResultGroup = [
    YvzCard.styles,
    css`
      ha-card {
        container-type: inline-size;
      }

      ha-icon {
        --mdc-icon-size: 16px;
      }

      .periods {
        --yvz-segmented-height: 32px;
        margin-top: var(--yvz-space-3);
      }

      .periods.in-header {
        margin-top: 0;
      }

      yvz-banner {
        margin-top: var(--yvz-space-3);
      }

      .body {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: var(--yvz-space-5);
        margin-top: var(--yvz-space-4);
      }

      .kpis {
        display: grid;
        gap: var(--yvz-space-3);
      }

      /* the two columns; below 1100 px everything stacks: timeline, daily bars, rooms, events */
      .main {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        gap: var(--yvz-space-4);
        min-width: 0;
      }

      .col {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-4);
        min-width: 0;
      }

      .panel {
        padding: var(--yvz-space-4) var(--yvz-space-5);
        border-radius: var(--yvz-radius-md);
        background: var(--yvz-surface-raised);
      }

      yvz-section-title.wrap {
        flex-wrap: wrap;
      }

      section {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-2);
        min-width: 0;
      }

      .tiles {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--yvz-space-2);
      }

      .hint {
        margin: 0;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        line-height: var(--yvz-line-label);
      }

      .loading {
        margin-top: var(--yvz-space-4);
      }

      .season {
        margin: 0;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        line-height: var(--yvz-line-label);
        font-variant-numeric: tabular-nums;
      }

      /* the run chart takes the spare height of the card; the chart fills its box */
      .plot-section {
        flex: 1 1 auto;
        /* the chart box, its axis, the panel padding and the title above it */
        max-height: ${MAX_PLOT_PX + 96}px;
      }

      .plot {
        position: relative;
        flex: 1 1 160px;
        min-height: 160px;
      }

      .plot yvz-timeline {
        position: absolute;
        inset: 0;
      }

      .legend {
        display: inline-flex;
        align-items: center;
        gap: var(--yvz-space-1);
        letter-spacing: normal;
        text-transform: none;
      }

      .swatch {
        display: inline-block;
        width: 10px;
        height: 4px;
        margin-inline-start: var(--yvz-space-2);
        border-radius: 2px;
      }

      .swatch.run {
        background: var(--yvz-accent);
      }

      .swatch.line {
        background: var(--yvz-text);
      }

      .swatch.out {
        background: var(--yvz-standby, var(--yvz-text-muted));
        opacity: 0.6;
      }

      .swatch.who {
        width: 12px;
        height: 12px;
        border: 1px solid var(--yvz-text-muted);
        border-radius: 50%;
        background: var(--yvz-on);
      }

      .swatch.dash {
        height: 0;
        border-top: 2px dashed var(--yvz-text-muted);
        border-radius: 0;
      }

      .rooms {
        display: flex;
        flex-direction: column;
      }

      .room {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto auto minmax(56px, 88px);
        align-items: center;
        gap: var(--yvz-space-3);
        min-height: 40px;
        padding-inline: var(--yvz-space-2);
        margin-inline: calc(var(--yvz-space-2) * -1);
        border-bottom: 1px solid var(--yvz-divider);
        border-radius: var(--yvz-radius-sm);
        cursor: pointer;
        transition: background var(--yvz-duration-base) var(--yvz-ease);
      }

      .room:hover {
        background: color-mix(in srgb, var(--yvz-text) 5%, transparent);
      }

      .room.armed {
        background: var(--yvz-state-soft, var(--yvz-accent-soft));
      }

      .room .name {
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-width: 0;
      }

      .room .name .title {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-1);
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .room .hum {
        display: flex;
        align-items: center;
        gap: 2px;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-caption);
        font-variant-numeric: tabular-nums;
        line-height: var(--yvz-line-caption);
      }

      .room .hum.high {
        color: var(--yvz-pending);
      }

      .room .hum ha-icon {
        --mdc-icon-size: 12px;
      }

      .room.lead .name {
        font-weight: var(--yvz-weight-medium);
      }

      .room .title ha-icon {
        flex: none;
        color: var(--yvz-text-muted);
      }

      .room .title ha-icon.cold {
        color: var(--yvz-standby);
      }

      .room .confirm {
        grid-column: span 4;
        color: var(--yvz-text);
        font-size: var(--yvz-text-label);
        font-weight: var(--yvz-weight-medium);
        text-align: end;
      }

      .room .gap {
        min-width: 3.5ch;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        font-variant-numeric: tabular-nums;
        text-align: end;
      }

      .room .gap.below {
        color: var(--yvz-text);
      }

      .room.coldest .gap {
        color: var(--yvz-accent);
      }

      .room .now {
        font-variant-numeric: tabular-nums;
        font-weight: var(--yvz-weight-medium);
        text-align: end;
      }

      .room .range {
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .room .spark {
        --yvz-state: var(--yvz-text-muted);
      }

      .value {
        color: var(--yvz-text);
        font-variant-numeric: tabular-nums;
        font-weight: var(--yvz-weight-medium);
        text-align: end;
      }

      .events {
        display: flex;
        flex-direction: column;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .events li {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-2);
        min-height: 36px;
        border-bottom: 1px solid var(--yvz-divider);
      }

      .events li ha-icon {
        flex: none;
        color: var(--yvz-text-muted);
      }

      .events li[data-state="pending"] ha-icon {
        color: var(--yvz-pending);
      }

      .events .text {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .events .who {
        color: var(--yvz-text-muted);
      }

      .more {
        align-self: flex-start;
        min-height: 32px;
        margin-top: var(--yvz-space-1);
        padding: 0 var(--yvz-space-2);
        border: 0;
        border-radius: var(--yvz-radius-sm, 8px);
        background: none;
        color: var(--yvz-accent);
        font: inherit;
        font-size: var(--yvz-text-label);
        cursor: pointer;
      }

      .more:focus-visible {
        outline: 2px solid var(--yvz-accent);
        outline-offset: 1px;
      }

      .events time {
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      @container (max-width: 429px) {
        .room {
          grid-template-columns: minmax(0, 1fr) auto auto minmax(48px, 72px);
        }

        .room .range {
          display: none;
        }

        .room .confirm {
          grid-column: span 3;
        }
      }

      @container (min-width: 520px) {
        .tiles {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .periods {
          width: 280px;
        }
      }

      @container (min-width: 1100px) {
        .main {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 440px;
          align-items: stretch;
        }

        .main .col.left .plot-section {
          flex: 1 1 auto;
        }
      }

      .compact .tiles {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      @container (min-width: 520px) {
        .compact .tiles {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }

      .compact .body {
        gap: var(--yvz-space-3);
      }
    `,
  ];
}

registerCard({
  type: "yvz-heating-stats-card",
  name: "YVZ Heating stats",
  description: "How much the heating runs and how well it works: runtime, starts, temperatures, warm-up and events.",
});

declare global {
  interface HTMLElementTagNameMap {
    "yvz-heating-stats-card": YvzHeatingStatsCard;
  }
}
