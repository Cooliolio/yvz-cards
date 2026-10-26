import { css, html, nothing, type TemplateResult } from "lit";
import "../design";
import type { GaugeVariant } from "../design";
import { isActionable, pressHandlers, type ActionsConfig } from "./actions";
import { iconOf, localeOf, nameOf, numberOf, stateOf, unitOf, type BlockContext } from "./context";

export interface GaugeBlockConfig extends ActionsConfig {
  entity: string;
  name?: string;
  icon?: string;
  unit?: string;
  variant?: GaugeVariant;
  min?: number;
  max?: number;
  decimals?: number;
  // Same thresholds as every other gauge: colour turns amber at warn_at and red at error_at.
  warn_at?: number;
  error_at?: number;
  // Low values are the bad ones (a battery).
  invert?: boolean;
  // A fixed number, or another entity whose state is the target.
  target?: number | string;
  trend?: boolean;
  trend_hours?: number;
}

// A gauge for one entity, with an optional trend line underneath.
export function renderGaugeBlock(ctx: BlockContext, c: GaugeBlockConfig): TemplateResult {
  const value = numberOf(ctx, c.entity);
  const variant = c.variant ?? "line";
  const target = typeof c.target === "string" ? numberOf(ctx, c.target) : c.target;
  const decimals = c.decimals ?? (value !== undefined && !Number.isInteger(value) && Math.abs(value) < 10 ? 1 : 0);
  const press = pressHandlers(ctx, c);
  const actionable = isActionable(c);
  const showTrend = c.trend && variant !== "segments" && stateOf(ctx, c.entity);
  return html`<div
    class="yvz-block ${actionable ? "tap" : ""}"
    role=${actionable ? "button" : nothing}
    tabindex=${actionable ? 0 : nothing}
    @pointerdown=${press.down}
    @pointerup=${press.cancel}
    @pointerleave=${press.cancel}
    @pointercancel=${press.cancel}
    @click=${press.click}
    @keydown=${press.key}
  >
    <yvz-gauge
      .variant=${variant}
      .label=${c.name ?? nameOf(ctx, c.entity)}
      .icon=${c.icon ?? iconOf(ctx, c.entity)}
      .unit=${c.unit ?? unitOf(ctx, c.entity)}
      .value=${value}
      .min=${c.min ?? 0}
      .max=${c.max ?? 100}
      .decimals=${decimals}
      .warnAt=${c.warn_at}
      .errorAt=${c.error_at}
      .invert=${c.invert ?? false}
      .target=${target}
      .locale=${localeOf(ctx)}
    ></yvz-gauge>
    ${showTrend
      ? html`<yvz-sparkline
          class="trend"
          .hass=${ctx.hass}
          .entity=${c.entity}
          .unit=${c.unit ?? unitOf(ctx, c.entity)}
          .hours=${c.trend_hours ?? 24}
          .height=${22}
          .locale=${localeOf(ctx)}
        ></yvz-sparkline>`
      : nothing}
  </div>`;
}

export const gaugeBlockStyles = css`
  .yvz-block.tap {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .yvz-block .trend {
    display: block;
    margin-top: var(--yvz-space-2);
  }
`;
