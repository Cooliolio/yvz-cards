import { css, html, nothing, type CSSResultGroup, type PropertyValues, type TemplateResult } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import "../../design";
import { formatNumber, formatTime } from "../../shared/format";
import { haptic } from "../../shared/haptic";
import type { TranslationKey } from "../../shared/i18n";
import { registerCard } from "../../shared/register-card";
import type { HomeAssistant, LovelaceCardConfig } from "../../shared/types";
import { YvzCard } from "../../shared/yvz-card";
import "./yvz-frigate-review-card-editor";
import {
  DEFAULT_COLUMNS,
  DEFAULT_GRID_COUNT,
  DEFAULT_REFRESH,
  MAX_COUNT,
  MAX_FETCH,
  MIN_REFRESH,
  type FrigateLayout,
  type FrigateReviewConfig,
  type Review,
} from "./types";

// A clip that hasn't produced a frame by then is given up on.
const STALL_MS = 8000;
const SIGN_SECONDS = 600;
const DAY_MS = 86_400_000;

interface Source {
  url: string;
  // The detection clip: shorter than the review, and the one phones play most reliably.
  short: boolean;
}

interface Playback {
  status: "loading" | "playing" | "failed";
  short: boolean;
  // The signed link of the full clip, for "Open in new tab" when nothing plays.
  link?: string;
}

@customElement("yvz-frigate-review-card")
export class YvzFrigateReviewCard extends YvzCard<FrigateReviewConfig> {
  // Everything fetched so far, newest first; `shown` of them are on screen.
  @state() private pool: Review[] = [];
  @state() private shown = 0;
  @state() private selected?: string;
  @state() private error?: string;
  @state() private moreAvailable = false;
  @state() private loadingMore = false;
  @state() private first = 0;
  @state() private perPage = 2;
  @state() private playback: Playback = { status: "loading", short: false };
  @query(".strip") private strip?: HTMLElement;
  @query("video") private video?: HTMLVideoElement;

  private started = false;
  private fetching = false;
  // No older events exist beyond what "Load more" already got.
  private exhausted = false;
  private stamp = Date.now();
  private timer?: ReturnType<typeof setInterval>;
  private token = 0;
  private sources: Source[] = [];
  private attemptAt = 0;
  private stall?: ReturnType<typeof setTimeout>;
  private lazy?: IntersectionObserver;
  private lazyRoot?: Element | null;
  private resize?: ResizeObserver;
  private watched?: Element;
  private frame = 0;
  private keepLeft?: number;

  static getConfigElement(): HTMLElement {
    return document.createElement("yvz-frigate-review-card-editor");
  }

  static getStubConfig(): Partial<FrigateReviewConfig> {
    return { severity: "alert" };
  }

  setConfig(config: LovelaceCardConfig): void {
    if (!config || typeof config !== "object") throw new Error("yvz-frigate-review-card: invalid configuration");
    this.config = config as FrigateReviewConfig;
    this.shown = this.opts.count;
    this.exhausted = false;
    this.startTimer();
    if (this.hass && this.started) void this.refresh();
  }

  override getCardSize(): number {
    return this.opts.layout === "grid" ? 2 + Math.ceil(this.opts.count / this.opts.columns) * 2 : 3;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.startTimer();
    document.addEventListener("visibilitychange", this.onVisible);
    this.resize = new ResizeObserver(() => this.measure());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.timer);
    clearTimeout(this.stall);
    cancelAnimationFrame(this.frame);
    document.removeEventListener("visibilitychange", this.onVisible);
    this.resize?.disconnect();
    this.lazy?.disconnect();
    this.lazy = undefined;
    this.watched = undefined;
  }

  /* ---------- options ---------- */

  // The config with the same defaults and limits as the earlier local card.
  private get opts() {
    const c = this.config ?? ({} as FrigateReviewConfig);
    const layout: FrigateLayout = c.layout === "grid" ? "grid" : "strip";
    const fallback = layout === "grid" ? DEFAULT_GRID_COUNT : MAX_COUNT;
    return {
      layout,
      count: Math.max(1, Math.min(MAX_COUNT, parseInt(String(c.count), 10) || fallback)),
      columns: Math.max(1, Math.min(6, parseInt(String(c.columns), 10) || DEFAULT_COLUMNS)),
      severity: c.severity ?? "alert",
      cameras: c.cameras ?? [],
      labels: c.labels ?? [],
      instance: c.instance_id ?? "frigate",
      pre: Number(c.pre_padding ?? 2) || 0,
      post: Number(c.post_padding ?? 3) || 0,
      refresh: Math.max(MIN_REFRESH, parseInt(String(c.refresh), 10) || DEFAULT_REFRESH),
    };
  }

  // Asks for more than shown, so camera and label filtering still fills the list.
  private get limit(): number {
    return Math.min(MAX_FETCH, this.opts.count * 5);
  }

  private get display(): Review[] {
    return this.pool.slice(0, this.shown);
  }

  /* ---------- data ---------- */

  private startTimer(): void {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (document.visibilityState === "visible") void this.refresh();
    }, this.opts.refresh * 1000);
  }

  private onVisible = (): void => {
    if (document.visibilityState === "visible") void this.refresh();
  };

  protected override willUpdate(changed: PropertyValues): void {
    // Where the strip is right before the list changes; browsers move it themselves in different ways afterwards.
    if (changed.has("pool") && this.strip) this.keepLeft = this.strip.scrollLeft;
    if (changed.has("hass") && this.hass && !this.started) {
      this.started = true;
      void this.refresh();
    }
  }

  private async fetchBatch(before?: number): Promise<{ raw: Review[]; list: Review[] }> {
    const o = this.opts;
    const msg: Record<string, unknown> = { type: "frigate/reviews/get", instance_id: o.instance, limit: this.limit };
    if (o.severity !== "all") msg.severity = o.severity;
    if (o.cameras.length) msg.cameras = o.cameras;
    if (before !== undefined) msg.before = before;
    const result = await (this.hass as HomeAssistant).callWS<unknown>(msg);
    const raw: Review[] = Array.isArray(typeof result === "string" ? JSON.parse(result) : result)
      ? ((typeof result === "string" ? JSON.parse(result) : result) as Review[])
      : [];
    let list = raw;
    if (o.cameras.length) list = list.filter((r) => o.cameras.includes(r.camera));
    if (o.labels.length) list = list.filter((r) => (r.data?.objects ?? []).some((label) => o.labels.includes(label)));
    list = [...list].sort((a, b) => b.start_time - a.start_time);
    return { raw, list };
  }

  private signature = (list: Review[]): string => JSON.stringify(list.map((r) => [r.id, r.end_time]));

  // The newest events. What "Load more" fetched earlier stays, and a list that didn't change is left alone,
  // so the strip keeps its place.
  private async refresh(): Promise<void> {
    if (!this.hass || this.fetching) return;
    this.fetching = true;
    try {
      const { raw, list } = await this.fetchBatch();
      const oldest = raw.length >= this.limit ? Math.min(...raw.map((r) => r.start_time)) : -Infinity;
      const kept = this.pool.filter((r) => r.start_time < oldest && !list.some((n) => n.id === r.id));
      const next = [...list, ...kept].sort((a, b) => b.start_time - a.start_time);
      this.stamp = Date.now();
      if (this.signature(next) !== this.signature(this.pool)) this.pool = next;
      this.moreAvailable = !this.exhausted && (raw.length >= this.limit || kept.length > 0);
      if (!this.shown) this.shown = this.opts.count;
      this.error = undefined;
    } catch (e) {
      this.error = this.t("frigate.load_failed", { error: e instanceof Error ? e.message : String((e as { code?: string })?.code ?? e) });
    } finally {
      this.fetching = false;
    }
  }

  private async loadMore(): Promise<void> {
    if (this.loadingMore || !this.hass) return;
    // Events already fetched but not shown come first.
    if (this.pool.length > this.shown) {
      this.shown += this.opts.count;
      return;
    }
    this.loadingMore = true;
    try {
      const oldest = this.pool[this.pool.length - 1]?.start_time;
      const { raw, list } = await this.fetchBatch(oldest);
      const fresh = list.filter((r) => !this.pool.some((p) => p.id === r.id));
      if (raw.length < this.limit) this.exhausted = true;
      this.moreAvailable = !this.exhausted;
      this.pool = [...this.pool, ...fresh].sort((a, b) => b.start_time - a.start_time);
      this.shown += Math.max(fresh.length, 0);
      if (!fresh.length) this.moreAvailable = raw.length >= this.limit && !this.exhausted;
    } catch (e) {
      this.error = this.t("frigate.load_failed", { error: e instanceof Error ? e.message : String(e) });
    } finally {
      this.loadingMore = false;
    }
  }

  private async clipUrl(r: Review): Promise<string> {
    const o = this.opts;
    const start = Math.floor(r.start_time - o.pre);
    const endRaw = r.end_time ? r.end_time : Date.now() / 1000;
    const end = Math.ceil(endRaw + (r.end_time ? o.post : 0));
    const path =
      `/api/frigate/${encodeURIComponent(o.instance)}/recording/` +
      `${encodeURIComponent(r.camera)}/start/${start}/end/${Math.max(end, start + 1)}`;
    const res = await this.hass!.callWS<{ path: string }>({ type: "auth/sign_path", path, expires: SIGN_SECONDS });
    return res.path;
  }

  /* ---------- the player ---------- */

  private async open(id: string): Promise<void> {
    const review = this.pool.find((r) => r.id === id);
    if (!review) return;
    haptic("selection");
    this.selected = id;
    this.scrollToTile(id);
    await this.updateComplete;
    void this.play(review);
  }

  // The full clip first; when it doesn't play (it answers 400 "No recordings found" for some events, and
  // ignores range requests, which iOS Safari often refuses) the detection clip, which phones play reliably.
  private async play(review: Review): Promise<void> {
    const token = ++this.token;
    clearTimeout(this.stall);
    this.playback = { status: "loading", short: false };
    let main: string | undefined;
    try {
      main = await this.clipUrl(review);
    } catch {
      main = undefined;
    }
    if (token !== this.token) return;
    const detection = [...(review.data?.detections ?? [])].sort()[0];
    this.sources = [
      main ? { url: main, short: false } : undefined,
      detection
        ? { url: `/api/frigate/notifications/${encodeURIComponent(detection)}/${encodeURIComponent(review.camera)}/clip.mp4`, short: true }
        : undefined,
    ].filter((s): s is Source => !!s);
    this.playback = { status: "loading", short: false, link: main };
    this.attempt(token, 0);
  }

  private attempt(token: number, index: number): void {
    if (token !== this.token) return;
    clearTimeout(this.stall);
    const source = this.sources[index];
    if (!source) {
      this.video?.removeAttribute("src");
      this.playback = { status: "failed", short: false, link: this.playback.link };
      return;
    }
    const video = this.video;
    if (!video) return;
    this.attemptAt = index;
    this.playback = { status: "loading", short: source.short, link: this.playback.link };
    // Muted and inline, or phones won't start it; play() may still be refused, which is no reason to stop.
    video.muted = true;
    video.src = source.url;
    video.play()?.catch(() => {});
    this.stall = setTimeout(() => {
      if (token === this.token && this.playback.status === "loading") this.attempt(token, index + 1);
    }, STALL_MS);
  }

  private onVideoReady = (): void => {
    if (this.playback.status !== "loading") return;
    clearTimeout(this.stall);
    this.playback = { ...this.playback, status: "playing" };
  };

  private onVideoError = (): void => {
    if (!this.selected || this.playback.status === "failed") return;
    this.attempt(this.token, this.attemptAt + 1);
  };

  private close(): void {
    this.token++;
    clearTimeout(this.stall);
    const video = this.video;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    this.selected = undefined;
  }

  // The left button goes to the newer event in the strip, and to the older one in the grid, as before.
  private step(direction: 1 | -1): void {
    const list = this.display;
    const i = list.findIndex((r) => r.id === this.selected);
    const next = list[i + direction];
    if (i >= 0 && next) void this.open(next.id);
  }

  /* ---------- the strip ---------- */

  private get stride(): number {
    const tiles = this.strip?.querySelectorAll<HTMLElement>(".tile");
    if (!tiles?.length) return 0;
    return tiles.length > 1 ? tiles[1].offsetLeft - tiles[0].offsetLeft : tiles[0].offsetWidth;
  }

  private measure = (): void => {
    const strip = this.strip;
    const stride = this.stride;
    if (!strip || !stride) return;
    const perPage = Math.max(1, Math.round(strip.clientWidth / stride));
    const first = Math.max(0, Math.min(Math.round(strip.scrollLeft / stride), Math.max(0, this.display.length - perPage)));
    if (perPage !== this.perPage) this.perPage = perPage;
    if (first !== this.first) this.first = first;
  };

  private onScroll = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.measure();
    });
  };

  // Brings a tile to the middle of the strip without moving the page.
  private scrollToTile(id: string): void {
    const strip = this.strip;
    const tile = strip?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    if (!strip || !tile) return;
    strip.scrollTo({ left: tile.offsetLeft - (strip.clientWidth - tile.offsetWidth) / 2, behavior: "smooth" });
  }

  private onDot(index: number): void {
    this.strip?.scrollTo({ left: index * this.perPage * this.stride, behavior: "smooth" });
  }

  /* ---------- lazy previews ---------- */

  // A preview only downloads once its tile is near the visible part of the strip.
  private watchImages(): void {
    const root = this.strip ?? null;
    if (!this.lazy || this.lazyRoot !== root) {
      this.lazy?.disconnect();
      this.lazyRoot = root;
      this.lazy = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const img = entry.target as HTMLImageElement;
            img.src = img.dataset.src ?? "";
            img.dataset.loaded = img.dataset.src;
            this.lazy?.unobserve(img);
          }
        },
        { root, rootMargin: root ? "0px 100% 0px 100%" : "200px 0px" },
      );
    }
    for (const img of this.renderRoot.querySelectorAll<HTMLImageElement>("img[data-src]")) {
      if (img.dataset.loaded === img.dataset.src) continue;
      // Already on screen once: a changed address (an event that ended) replaces it straight away.
      if (img.dataset.loaded) {
        img.src = img.dataset.src ?? "";
        img.dataset.loaded = img.dataset.src;
      } else this.lazy.observe(img);
    }
  }

  protected override updated(changed: PropertyValues): void {
    this.watchImages();
    const strip = this.strip;
    if (strip !== this.watched) {
      if (this.watched) this.resize?.unobserve(this.watched);
      this.watched = strip ?? undefined;
      if (strip) this.resize?.observe(strip);
    }
    // New events arriving at the front push the rest along; keep what the finger was looking at in place.
    // Browsers re-snap on their own (Chrome keeps the snapped tile, Safari doesn't), so the position is set outright,
    // with snapping paused for a moment.
    const before = changed.get("pool") as Review[] | undefined;
    if (before !== undefined && strip && this.keepLeft) {
      const index = before.length ? this.display.findIndex((r) => r.id === before[0].id) : -1;
      const target = this.keepLeft + Math.max(0, index) * this.stride;
      if (Math.abs(strip.scrollLeft - target) > 1) {
        strip.style.scrollSnapType = "none";
        strip.scrollLeft = target;
        requestAnimationFrame(() => strip.style.removeProperty("scroll-snap-type"));
      }
    }
    this.measure();
  }

  /* ---------- text ---------- */

  private caption(r: Review) {
    const t = this.t;
    const hass = this.hass!;
    const name = r.camera.replace(/_/g, " ");
    const camera = name.charAt(0).toUpperCase() + name.slice(1);
    const at = new Date(r.start_time * 1000);
    const midnight = new Date().setHours(0, 0, 0, 0);
    const time = formatTime(hass, at);
    const lang = hass.locale?.language ?? hass.language;
    const when =
      at.getTime() >= midnight
        ? time
        : at.getTime() >= midnight - DAY_MS
          ? `${t("frigate.yesterday")} ${time}`
          : `${new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(at)} ${time}`;
    const objects = [...new Set(r.data?.objects ?? [])]
      .map((o) => {
        const key = `frigate.object.${o}` as TranslationKey;
        const text = t(key);
        return text === key ? o.replace(/_/g, " ") : text;
      })
      .join(", ");
    const seconds = r.end_time ? Math.max(1, Math.round(r.end_time - r.start_time)) : undefined;
    const detail = [objects, seconds ? t("frigate.seconds", { count: formatNumber(hass, seconds) }) : t("frigate.ongoing")].filter(Boolean).join(" · ");
    return { camera, when, detail };
  }

  private preview(r: Review): string {
    if (r.end_time) return `/api/frigate/notifications/${encodeURIComponent(r.id)}/review_preview.gif?v=${Math.floor(r.end_time)}`;
    const detection = (r.data?.detections ?? [])[0] ?? r.id;
    return `/api/frigate/notifications/${encodeURIComponent(detection)}/thumbnail.jpg?v=${this.stamp}`;
  }

  /* ---------- render ---------- */

  private renderTile(r: Review): TemplateResult {
    const t = this.t;
    const cap = this.caption(r);
    return html`<button
      class="tile ${r.id === this.selected ? "active" : ""}"
      role="listitem"
      data-id=${r.id}
      aria-label=${t("frigate.play", { camera: cap.camera, when: cap.when })}
      @click=${() => this.open(r.id)}
    >
      <span class="media">
        <img data-src=${this.preview(r)} alt="" draggable="false" @error=${(e: Event) => ((e.target as HTMLElement).style.visibility = "hidden")} />
        ${r.end_time ? nothing : html`<span class="live">${t("frigate.now")}</span>`}
        <span class="play"><ha-icon icon="mdi:play"></ha-icon></span>
      </span>
      <span class="cap">
        <span class="line">${cap.camera} · ${cap.when}</span>
        <span class="sub">${cap.detail}</span>
      </span>
    </button>`;
  }

  private renderMore(): TemplateResult | typeof nothing {
    if (!this.moreAvailable && this.pool.length <= this.shown) return nothing;
    return html`<button class="tile more" @click=${this.loadMore} ?disabled=${this.loadingMore}>
      <ha-icon .icon=${this.loadingMore ? "mdi:loading" : "mdi:plus"}></ha-icon>
      <span>${this.t("frigate.load_more")}</span>
    </button>`;
  }

  private renderPlayer(): TemplateResult | typeof nothing {
    if (!this.selected) return nothing;
    const t = this.t;
    const list = this.display;
    const review = list.find((r) => r.id === this.selected);
    if (!review) return nothing;
    const cap = this.caption(review);
    const i = list.indexOf(review);
    const grid = this.opts.layout === "grid";
    // Grid: the left button is the older event, as it always was. Strip: left is newer, like the strip itself.
    const leftDir: 1 | -1 = grid ? 1 : -1;
    const left = list[i + leftDir];
    const right = list[i - leftDir];
    const { status, short, link } = this.playback;
    const poster = review.end_time ? `/api/frigate/notifications/${encodeURIComponent(review.id)}/review_preview.gif` : "";
    return html`<div class="player">
      <div class="screen">
        <video
          controls
          muted
          playsinline
          preload="metadata"
          poster=${poster || nothing}
          @loadeddata=${this.onVideoReady}
          @playing=${this.onVideoReady}
          @error=${this.onVideoError}
        ></video>
        ${short && status !== "failed" ? html`<yvz-chip class="short" data-state="pending" icon="mdi:content-cut">${t("frigate.short")}</yvz-chip>` : nothing}
        ${status === "failed"
          ? html`<div class="failed" role="alert">
              <ha-icon icon="mdi:video-off-outline"></ha-icon>
              <p>${t("frigate.unavailable")}</p>
              ${link ? html`<a href=${link} target="_blank" rel="noopener">${t("frigate.open_tab")}</a>` : nothing}
            </div>`
          : nothing}
      </div>
      <div class="bar">
        <yvz-icon-button
          raised
          icon="mdi:chevron-left"
          .label=${t(leftDir === 1 ? "frigate.older" : "frigate.newer")}
          ?disabled=${!left}
          @click=${() => this.step(leftDir)}
        ></yvz-icon-button>
        <div class="info"><span>${cap.camera} · ${cap.when}</span><span class="sub">${cap.detail}</span></div>
        <yvz-icon-button
          raised
          icon="mdi:chevron-right"
          .label=${t(leftDir === 1 ? "frigate.newer" : "frigate.older")}
          ?disabled=${!right}
          @click=${() => this.step(-leftDir as 1 | -1)}
        ></yvz-icon-button>
        <yvz-icon-button raised icon="mdi:close" .label=${t("frigate.close")} @click=${this.close}></yvz-icon-button>
      </div>
    </div>`;
  }

  protected override render() {
    if (!this.config || !this.hass) return nothing;
    const t = this.t;
    const o = this.opts;
    const list = this.display;
    const strip = o.layout === "strip";
    const pages = Math.ceil(list.length / this.perPage);
    const subtitle = !list.length
      ? ""
      : strip
        ? t("frigate.range", {
            from: this.first + 1,
            to: Math.min(this.first + this.perPage, list.length),
            total: list.length,
          })
        : t("frigate.count", { total: list.length });

    let content: TemplateResult;
    if (this.error) content = html`<yvz-banner tone="error">${this.error}</yvz-banner>`;
    else if (!list.length) content = html`<p class="hint">${t("frigate.empty")}</p>`;
    else {
      const tiles = repeat(list, (r) => r.id, (r) => this.renderTile(r));
      content = strip
        ? html`<div class="strip" role="list" @scroll=${this.onScroll}>${tiles}${this.renderMore()}</div>`
        : html`<div class="grid" role="list" style="--cols: ${o.columns}">${tiles}${this.renderMore()}</div>`;
    }

    return html`<ha-card>
      <yvz-card-header icon="mdi:cctv" .heading=${this.config.title || t("frigate.default_name")} .subtitle=${subtitle}></yvz-card-header>
      <div class="body">
        ${this.renderPlayer()} ${content}
        ${strip && pages > 1 && !this.error
          ? html`<yvz-dots
              .count=${pages}
              .current=${Math.min(pages - 1, Math.round(this.first / this.perPage))}
              .label=${t("frigate.page")}
              @yvz-select=${(e: CustomEvent<{ index: number }>) => this.onDot(e.detail.index)}
            ></yvz-dots>`
          : nothing}
      </div>
    </ha-card>`;
  }

  static override styles: CSSResultGroup = [
    YvzCard.styles,
    css`
      ha-card {
        container-type: inline-size;
      }

      ha-icon {
        --mdc-icon-size: 18px;
      }

      .body {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-3);
        margin-top: var(--yvz-space-3);
      }

      .hint {
        margin: 0;
        color: var(--yvz-text-muted);
      }

      /* the strip runs to the card's edges, so the next tile peeks in and says "swipe" */
      .strip {
        position: relative;
        display: flex;
        gap: var(--yvz-space-2);
        margin-inline: calc(var(--yvz-space-4) * -1);
        padding-inline: var(--yvz-space-4);
        overflow-x: auto;
        overflow-anchor: none;
        overscroll-behavior-x: contain;
        scroll-padding-inline: var(--yvz-space-4);
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
      }

      .strip::-webkit-scrollbar {
        display: none;
      }

      .strip .tile {
        flex: 0 0 46%;
        scroll-snap-align: start;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
        gap: var(--yvz-space-2);
      }

      .tile {
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding: 0;
        overflow: hidden;
        border: 0;
        border-radius: var(--yvz-radius-md);
        background: var(--yvz-surface-raised);
        color: var(--yvz-text);
        font: inherit;
        text-align: start;
        cursor: pointer;
        transition:
          box-shadow var(--yvz-duration-base) var(--yvz-ease),
          transform var(--yvz-duration-fast) var(--yvz-ease);
      }

      .tile:active {
        transform: scale(var(--yvz-press-scale));
      }

      .tile.active {
        box-shadow: 0 0 0 2px var(--yvz-accent);
      }

      .media {
        position: relative;
        display: block;
        aspect-ratio: 16 / 9;
        background: #000;
      }

      .media img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      /* readable on any picture, so fixed dark pills rather than theme colours */
      .live {
        position: absolute;
        top: var(--yvz-space-2);
        inset-inline-start: var(--yvz-space-2);
        padding: 1px var(--yvz-space-2);
        border-radius: var(--yvz-radius-sm);
        background: var(--yvz-error);
        color: #fff;
        font-size: var(--yvz-text-caption);
        font-weight: var(--yvz-weight-strong);
        line-height: var(--yvz-line-caption);
      }

      .play {
        position: absolute;
        inset-inline-end: var(--yvz-space-2);
        bottom: var(--yvz-space-2);
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgb(0 0 0 / 0.55);
        color: #fff;
      }

      .play ha-icon {
        --mdc-icon-size: 16px;
      }

      .cap {
        display: flex;
        flex-direction: column;
        padding: var(--yvz-space-1) var(--yvz-space-2) var(--yvz-space-2);
        font-size: var(--yvz-text-label);
        line-height: var(--yvz-line-label);
      }

      .cap .line,
      .cap .sub {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cap .sub,
      .info .sub {
        color: var(--yvz-text-muted);
      }

      .tile.more {
        align-items: center;
        justify-content: center;
        gap: var(--yvz-space-1);
        min-height: 96px;
        background: none;
        box-shadow: inset 0 0 0 1px var(--yvz-divider);
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-body);
      }

      .tile.more:hover {
        color: var(--yvz-text);
      }

      .tile.more:disabled {
        cursor: default;
        opacity: 0.6;
      }

      .player {
        display: flex;
        flex-direction: column;
        gap: var(--yvz-space-2);
      }

      .screen {
        position: relative;
        overflow: hidden;
        border-radius: var(--yvz-radius-md);
        background: #000;
      }

      video {
        display: block;
        width: 100%;
        aspect-ratio: 16 / 9;
        max-height: 70vh;
        object-fit: contain;
      }

      .short {
        position: absolute;
        top: var(--yvz-space-2);
        inset-inline-start: var(--yvz-space-2);
        pointer-events: none;
      }

      .failed {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--yvz-space-2);
        padding: var(--yvz-space-4);
        background: rgb(0 0 0 / 0.8);
        color: #fff;
        text-align: center;
      }

      .failed ha-icon {
        --mdc-icon-size: 28px;
        opacity: 0.8;
      }

      .failed p {
        margin: 0;
        font-size: var(--yvz-text-body);
      }

      .failed a {
        padding: var(--yvz-space-2) var(--yvz-space-3);
        border-radius: var(--yvz-radius-md);
        background: rgb(255 255 255 / 0.16);
        color: #fff;
        font-size: var(--yvz-text-body);
        text-decoration: none;
      }

      .bar {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-2);
        --yvz-icon-button-size: 36px;
      }

      .info {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-width: 0;
        font-size: var(--yvz-text-label);
        line-height: var(--yvz-line-label);
      }

      .info span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* more tiles on a wider card */
      @container (min-width: 480px) {
        .strip .tile {
          flex-basis: 31%;
        }
      }

      @container (min-width: 720px) {
        .strip .tile {
          flex-basis: 23%;
        }
      }

      @container (min-width: 1000px) {
        .strip .tile {
          flex-basis: 16%;
        }
      }
    `,
  ];
}

// The earlier local card was called frigate-review-card; keeping the name means existing dashboards carry on.
if (!customElements.get("frigate-review-card")) {
  customElements.define("frigate-review-card", class extends YvzFrigateReviewCard {});
}

registerCard({
  type: "yvz-frigate-review-card",
  name: "YVZ Frigate reviews",
  description: "Recent Frigate reviews as a swipeable strip or a grid. Tap one to play its clip.",
});

declare global {
  interface HTMLElementTagNameMap {
    "yvz-frigate-review-card": YvzFrigateReviewCard;
  }
}
