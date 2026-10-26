import { fireMoreInfo } from "../shared/more-info";
import { haptic } from "../shared/haptic";
import type { BlockContext } from "./context";

// A small subset of Home Assistant's action config, enough for tiles and gauges.
export interface ActionConfig {
  action: "more-info" | "toggle" | "call-service" | "perform-action" | "navigate" | "url" | "none";
  navigation_path?: string;
  url_path?: string;
  service?: string;
  perform_action?: string;
  data?: Record<string, unknown>;
  service_data?: Record<string, unknown>;
  target?: Record<string, unknown>;
}

export interface ActionsConfig {
  entity?: string;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
}

const HOLD_MS = 500;
const DEFAULT_TAP: ActionConfig = { action: "more-info" };
const NONE: ActionConfig = { action: "none" };

export const tapOf = (c: ActionsConfig): ActionConfig => c.tap_action ?? DEFAULT_TAP;
export const holdOf = (c: ActionsConfig): ActionConfig => c.hold_action ?? NONE;

export function isActionable(c: ActionsConfig): boolean {
  return tapOf(c).action !== "none" || holdOf(c).action !== "none";
}

export function runAction(ctx: BlockContext, entity: string | undefined, action: ActionConfig): void {
  const { hass, host } = ctx;
  switch (action.action) {
    case "more-info":
      fireMoreInfo(host, entity);
      break;
    case "toggle":
      if (entity) void hass.callService("homeassistant", "toggle", { entity_id: entity });
      break;
    case "call-service":
    case "perform-action": {
      const [domain, service] = String(action.perform_action ?? action.service ?? "").split(".");
      if (!domain || !service) return;
      const data = { ...(action.data ?? action.service_data) };
      void hass.callService(domain, service, data, action.target);
      break;
    }
    case "navigate":
      if (action.navigation_path) {
        history.pushState(null, "", action.navigation_path);
        window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      }
      break;
    case "url":
      if (action.url_path) window.open(action.url_path, "_blank", "noopener");
      break;
  }
  if (action.action !== "none") haptic("light");
}

interface Press {
  timer?: ReturnType<typeof setTimeout>;
  held: boolean;
}

// Pressed state lives on the element, so a re-render between press and release doesn't lose it.
const presses = new WeakMap<EventTarget, Press>();

// Event bindings for a tappable block: tap, press-and-hold, and Enter / Space for the keyboard.
export function pressHandlers(ctx: BlockContext, config: ActionsConfig) {
  const tap = tapOf(config);
  const hold = holdOf(config);
  const state = (e: Event): Press => {
    const key = e.currentTarget as EventTarget;
    let p = presses.get(key);
    if (!p) presses.set(key, (p = { held: false }));
    return p;
  };
  return {
    down: (e: Event) => {
      const p = state(e);
      p.held = false;
      clearTimeout(p.timer);
      if (hold.action === "none") return;
      p.timer = setTimeout(() => {
        p.held = true;
        runAction(ctx, config.entity, hold);
      }, HOLD_MS);
    },
    cancel: (e: Event) => clearTimeout(state(e).timer),
    click: (e: Event) => {
      const p = state(e);
      clearTimeout(p.timer);
      if (p.held) {
        p.held = false;
        return;
      }
      runAction(ctx, config.entity, tap);
    },
    key: (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      runAction(ctx, config.entity, tap);
    },
  };
}
