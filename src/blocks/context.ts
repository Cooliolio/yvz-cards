import type { HassEntity, HomeAssistant } from "../shared/types";

// What a block needs to render: Home Assistant, and the element it lives in (for events).
export interface BlockContext {
  hass: HomeAssistant;
  host: HTMLElement;
}

export const isGone = (state?: string): boolean => state === undefined || state === "unavailable" || state === "unknown";

export function stateOf(ctx: BlockContext, entity?: string): HassEntity | undefined {
  return entity ? ctx.hass.states[entity] : undefined;
}

export function numberOf(ctx: BlockContext, entity?: string): number | undefined {
  const st = stateOf(ctx, entity);
  if (!st || isGone(st.state)) return undefined;
  const n = parseFloat(st.state);
  return Number.isNaN(n) ? undefined : n;
}

export function unitOf(ctx: BlockContext, entity?: string, fallback = ""): string {
  const unit = stateOf(ctx, entity)?.attributes.unit_of_measurement;
  return typeof unit === "string" ? unit : fallback;
}

export function nameOf(ctx: BlockContext, entity?: string): string {
  const name = stateOf(ctx, entity)?.attributes.friendly_name;
  return typeof name === "string" ? name : (entity ?? "");
}

export function iconOf(ctx: BlockContext, entity?: string): string {
  const icon = stateOf(ctx, entity)?.attributes.icon;
  return typeof icon === "string" ? icon : "";
}

export const localeOf = (ctx: BlockContext): string => ctx.hass.locale?.language ?? ctx.hass.language;
