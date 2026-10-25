import { html, render } from "lit";
import { live } from "lit/directives/live.js";
import "./ha-stubs";
import "./gauge-gallery";
import "../src/index";
import type { HomeAssistant } from "../src/shared/types";
import { scenes, type Control, type ControlValue, type Scene } from "./scenes";

interface CardElement extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass?: HomeAssistant;
}

let scene: Scene = scenes[0];
let values: Record<string, ControlValue> = {};
let language = "en";
let theme = "dark";
let width = 440;
let failServices = false;
let configText = "";
let configError = false;
let card: CardElement | undefined;
let cardTag = "";
const log: string[] = [];

function resetScene(next: Scene): void {
  scene = next;
  width = next.width ?? 440;
  values = Object.fromEntries(next.controls.map((c) => [c.key, c.value]));
  configText = JSON.stringify(next.config, null, 2);
  configError = false;
  card = undefined;
}

function buildHass(): HomeAssistant {
  const states = scene.states(values);
  return {
    states,
    language,
    locale: { language, time_format: "language" },
    config: { time_zone: "Europe/Brussels" },
    formatEntityState: (st) => st.state,
    async callWS<T>(message: Record<string, unknown>): Promise<T> {
      if (message.type !== "history/history_during_period") throw new Error("unsupported");
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
      update();
      if (failServices) throw new Error("mock failure");
    },
  };
}

function syncCard(stage: HTMLElement): void {
  if (!card || cardTag !== scene.tag) {
    stage.replaceChildren();
    card = document.createElement(scene.tag) as CardElement;
    cardTag = scene.tag;
    stage.append(card);
    applyConfig();
  }
  card.hass = buildHass();
}

function applyConfig(): void {
  try {
    card?.setConfig(JSON.parse(configText));
    configError = false;
  } catch {
    configError = true;
  }
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

function update(): void {
  document.documentElement.dataset.theme = theme;
  const app = document.getElementById("app")!;
  render(
    html`
      <aside>
        <h2>Card</h2>
        <label>Scene
          <select @change=${(e: Event) => {
            resetScene(scenes.find((s) => s.name === (e.target as HTMLSelectElement).value) ?? scene);
            update();
          }}>
            ${scenes.map((s) => html`<option ?selected=${s === scene}>${s.name}</option>`)}
          </select>
        </label>
        <label>Language
          <select @change=${(e: Event) => { language = (e.target as HTMLSelectElement).value; update(); }}>
            ${["en", "nl", "tr"].map((l) => html`<option ?selected=${l === language}>${l}</option>`)}
          </select>
        </label>
        <label>Theme
          <select @change=${(e: Event) => { theme = (e.target as HTMLSelectElement).value; update(); }}>
            ${["dark", "light"].map((t) => html`<option ?selected=${t === theme}>${t}</option>`)}
          </select>
        </label>
        <label>Width: ${width}px
          <input type="range" min="260" max="1400" step="10" .value=${live(String(width))}
            @input=${(e: Event) => { width = Number((e.target as HTMLInputElement).value); update(); }} />
        </label>
        <label class="check"><input type="checkbox" .checked=${failServices}
          @change=${(e: Event) => { failServices = (e.target as HTMLInputElement).checked; }} />Services fail</label>
        <h2>State</h2>
        ${scene.controls.map(renderControl)}
        <h2>Config (JSON)</h2>
        <textarea class=${configError ? "bad" : ""} .value=${live(configText)}
          @input=${(e: Event) => { configText = (e.target as HTMLTextAreaElement).value; applyConfig(); update(); }}></textarea>
      </aside>
      <main>
        <div class="stage" style="width: ${width}px"></div>
        <ul class="log">${log.length ? log.map((l) => html`<li>${l}</li>`) : html`<li>service calls appear here</li>`}</ul>
      </main>
    `,
    app,
  );
  syncCard(app.querySelector(".stage")!);
}

resetScene(scene);
update();
