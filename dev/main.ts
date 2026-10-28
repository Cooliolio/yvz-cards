import { html, render } from "lit";
import { live } from "lit/directives/live.js";
import "./ha-stubs";
import "./gauge-gallery";
import "../src/index";
import type { HomeAssistant } from "../src/shared/types";
import { scenes, type Control, type ControlValue, type Preset, type Scene } from "./scenes";

interface CardElement extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass?: HomeAssistant;
}

const STORE_KEY = "yvz-playground";

interface Saved {
  scene?: string;
  state?: string;
  language?: string;
  theme?: string;
  width?: number;
  height?: number;
}

function readSaved(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Saved;
  } catch {
    return {};
  }
}

let scene: Scene = scenes[0];
let preset: Preset | undefined;
let extras: Record<string, unknown>[] = [];
let values: Record<string, ControlValue> = {};
let language = "en";
let theme = "dark";
let width = 440;
let height = 0;
let failServices = false;
let configText = "";
let configError = false;
let cards: CardElement[] = [];
const log: string[] = [];

// Remembers where you were, in the address and in storage, so a reload (or a hot reload after an edit)
// puts you back on the same scene and state.
function persist(): void {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ scene: scene.name, state: preset?.name, language, theme, width, height } satisfies Saved),
    );
  } catch {
    // Storage can be blocked; the address still remembers the scene.
  }
  const params = new URLSearchParams(location.search);
  params.set("scene", scene.name);
  if (preset) params.set("state", preset.name);
  else params.delete("state");
  history.replaceState(null, "", `?${params.toString()}`);
}

// Opens a scene in one of its states (or its defaults when no preset is given).
function openScene(next: Scene, nextPreset?: Preset): void {
  scene = next;
  preset = nextPreset;
  width = nextPreset?.width ?? next.width ?? 440;
  height = nextPreset?.height ?? next.height ?? 0;
  values = { ...Object.fromEntries(next.controls.map((c) => [c.key, c.value])), ...nextPreset?.values };
  configText = JSON.stringify(nextPreset?.config ?? next.config, null, 2);
  extras = nextPreset?.extra ?? next.extra ?? [];
  configError = false;
  cards = [];
}

// Moves through the scenes, or through the states of the current scene (the defaults come first).
function step(kind: "scene" | "state", direction: 1 | -1): void {
  if (kind === "scene") {
    const next = scenes[(scenes.indexOf(scene) + direction + scenes.length) % scenes.length];
    openScene(next);
  } else {
    const states: Array<Preset | undefined> = [undefined, ...(scene.presets ?? [])];
    const at = states.indexOf(preset);
    openScene(scene, states[(at + direction + states.length) % states.length]);
  }
  persist();
  update();
}

function buildHass(): HomeAssistant {
  const states = scene.states(values);
  return {
    states,
    entities: scene.registry?.entities,
    devices: scene.registry?.devices,
    language,
    locale: { language, time_format: "language" },
    config: { time_zone: "Europe/Brussels" },
    formatEntityState: (st) => st.state,
    async callWS<T>(message: Record<string, unknown>): Promise<T> {
      if (message.type !== "history/history_during_period") throw new Error("unsupported");
      const custom = scene.history?.(message, values);
      if (custom) return custom as T;
      const start = Date.parse(message.start_time as string) / 1000;
      const step = (Date.parse(message.end_time as string) / 1000 - start) / 96;
      const history = (id: string) => {
        const base = parseFloat(states[id]?.state ?? "0") || 0;
        const seed = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
        return Array.from({ length: 96 }, (_, i) => ({
          s: String(Math.max(0, base * (1 + 0.25 * Math.sin(i / 6 + seed) + 0.1 * Math.cos(i / 2.3 + seed)))),
          lu: start + i * step,
        }));
      };
      return Object.fromEntries((message.entity_ids as string[]).map((id) => [id, history(id)])) as T;
    },
    async callService(domain, service, data) {
      log.unshift(`${domain}.${service} ${JSON.stringify(data ?? {})}`);
      log.length = Math.min(log.length, 12);
      const patch = scene.service?.(domain, service, data ?? {}, values);
      if (patch) values = { ...values, ...patch };
      update();
      if (failServices) throw new Error("mock failure");
    },
  };
}

function syncCard(stage: HTMLElement): void {
  if (!cards.length) {
    stage.replaceChildren();
    // Extra cards may be of another type than the main one, e.g. an old and a new version side by side.
    const tags = [scene.tag, ...extras.map((c) => String(c.type ?? "").replace("custom:", "") || scene.tag)];
    cards = tags.map((tag) => {
      const el = document.createElement(tag) as CardElement;
      stage.append(el);
      return el;
    });
    applyConfig();
  }
  const hass = buildHass();
  for (const el of cards) el.hass = hass;
}

function applyConfig(): void {
  try {
    cards[0]?.setConfig(JSON.parse(configText));
    configError = false;
  } catch {
    configError = true;
  }
  // Variants shown under the main card, e.g. the compact layout.
  extras.forEach((config, i) => cards[i + 1]?.setConfig(config));
}

function renderControl(c: Control) {
  const set = (value: ControlValue) => {
    values = { ...values, [c.key]: value };
    update();
  };
  if (c.type === "select") {
    return html`<label>${c.label}
      <select .value=${live(String(values[c.key]))} @change=${(e: Event) => set((e.target as HTMLSelectElement).value)}>
        ${c.options?.map((o) => html`<option value=${o}>${o}</option>`)}
      </select></label>`;
  }
  if (c.type === "range") {
    return html`<label>${c.label}: ${values[c.key]}
      <input type="range" min=${c.min ?? 0} max=${c.max ?? 100} step=${c.step ?? 1}
        .value=${live(String(values[c.key]))}
        @input=${(e: Event) => set(Number((e.target as HTMLInputElement).value))} /></label>`;
  }
  return html`<label class="check"><input type="checkbox" .checked=${Boolean(values[c.key])}
    @change=${(e: Event) => set((e.target as HTMLInputElement).checked)} />${c.label}</label>`;
}

const GROUPS = ["Cards", "Design"] as const;

function segmented(options: string[], current: string, onPick: (value: string) => void) {
  return html`<div class="seg">
    ${options.map((o) => html`<button class=${o === current ? "on" : ""} @click=${() => onPick(o)}>${o}</button>`)}
  </div>`;
}

function update(): void {
  document.documentElement.dataset.theme = theme;
  const app = document.getElementById("app")!;
  const states: Array<Preset | undefined> = [undefined, ...(scene.presets ?? [])];
  render(
    html`
      <nav>
        <h1>YVZ cards</h1>
        ${GROUPS.map((group) => {
          const list = scenes.filter((s) => (s.group ?? "Cards") === group);
          return list.length
            ? html`<h2>${group}</h2>
                <ul>
                  ${list.map(
                    (s) => html`<li>
                      <button class="scene ${s === scene ? "on" : ""}" @click=${() => { openScene(s); persist(); update(); }}>
                        ${s.name}${s.presets?.length ? html`<small>${s.presets.length}</small>` : ""}
                      </button>
                    </li>`,
                  )}
                </ul>`
            : "";
        })}
        <p class="keys">↑ ↓ scene · ← → state</p>
      </nav>
      <aside>
        <h2>View</h2>
        <div class="field">Language ${segmented(["en", "nl", "tr"], language, (l) => { language = l; persist(); update(); })}</div>
        <div class="field">Theme ${segmented(["dark", "light"], theme, (t) => { theme = t; persist(); update(); })}</div>
        <label>Width: ${width}px
          <input type="range" min="260" max="1400" step="10" .value=${live(String(width))}
            @input=${(e: Event) => { width = Number((e.target as HTMLInputElement).value); persist(); update(); }} />
        </label>
        <label>Panel height: ${height ? `${height}px` : "auto"}
          <input type="range" min="0" max="1400" step="10" .value=${live(String(height))}
            @input=${(e: Event) => { height = Number((e.target as HTMLInputElement).value); persist(); update(); }} />
        </label>
        <label class="check"><input type="checkbox" .checked=${failServices}
          @change=${(e: Event) => { failServices = (e.target as HTMLInputElement).checked; }} />Services fail</label>
        <h2>Entities</h2>
        ${scene.controls.map(renderControl)}
        <h2>Config (JSON)</h2>
        <textarea class=${configError ? "bad" : ""} .value=${live(configText)}
          @input=${(e: Event) => { configText = (e.target as HTMLTextAreaElement).value; applyConfig(); update(); }}></textarea>
      </aside>
      <main>
        <header class="bar">
          <span class="title">${scene.name}</span>
          ${states.length > 1
            ? html`<div class="states" role="tablist" aria-label="State">
                ${states.map(
                  (p) => html`<button class="chip ${p === preset ? "on" : ""}" role="tab" aria-selected=${p === preset}
                    @click=${() => { openScene(scene, p); persist(); update(); }}>${p?.name ?? "Default"}</button>`,
                )}
              </div>`
            : ""}
        </header>
        <div class="stage ${height ? "panel" : ""}" style="width: ${width}px; ${height ? `height: ${height}px` : ""}"></div>
        <ul class="log">${log.length ? log.map((l) => html`<li>${l}</li>`) : html`<li>service calls appear here</li>`}</ul>
      </main>
    `,
    app,
  );
  syncCard(app.querySelector(".stage")!);
}

// Where to start: the address wins (it also takes ?s.key=value overrides for one entity value), then what
// was saved last time, then the first scene.
const query = new URLSearchParams(location.search);
const saved = readSaved();
const wanted = query.get("scene") ?? saved.scene;
const start = scenes.find((s) => s.name.toLowerCase() === wanted?.toLowerCase()) ?? scenes[0];
const stateName = query.has("scene") ? query.get("state") : saved.state;
openScene(start, start.presets?.find((p) => p.name.toLowerCase() === stateName?.toLowerCase()));
for (const [key, raw] of query) {
  if (!key.startsWith("s.")) continue;
  values[key.slice(2)] = raw === "true" ? true : raw === "false" ? false : raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
}
const sameScene = saved.scene === start.name && saved.state === preset?.name;
width = Number(query.get("width")) || (sameScene ? saved.width : undefined) || width;
height = query.has("height") ? Number(query.get("height")) : sameScene && saved.height !== undefined ? saved.height : height;
theme = query.get("theme") ?? saved.theme ?? theme;
language = query.get("lang") ?? saved.language ?? language;

document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
  const move: Record<string, ["scene" | "state", 1 | -1]> = {
    ArrowDown: ["scene", 1],
    ArrowUp: ["scene", -1],
    ArrowRight: ["state", 1],
    ArrowLeft: ["state", -1],
  };
  if (!move[e.key]) return;
  e.preventDefault();
  step(...move[e.key]);
});

persist();
update();
