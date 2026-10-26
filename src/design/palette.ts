import { css, unsafeCSS } from "lit";

export const STATE_COLORS = {
  accent: "var(--primary-color)",
  on: "#5cc98a",
  off: "#6b7280",
  standby: "#4f8fe8",
  pending: "#f5a623",
  // Active heating or warming, warmer than the amber of a warning.
  heat: "#ff7a45",
  error: "#e0434f",
  unavailable: "#9ca3af",
} as const;

export type YvzState = keyof typeof STATE_COLORS;

export const YVZ_STATES = Object.keys(STATE_COLORS) as YvzState[];

// Derived per host so a user's --yvz-<state>-color override reaches every nested component.
const paletteTokens = YVZ_STATES.map(
  (s) => `
    --yvz-${s}: var(--yvz-${s}-color, ${STATE_COLORS[s]});
    --yvz-${s}-soft: color-mix(in srgb, var(--yvz-${s}) 14%, transparent);
    --yvz-${s}-strong: color-mix(in srgb, var(--yvz-${s}) 35%, transparent);
    --yvz-${s}-text: color-mix(in srgb, var(--yvz-${s}) 50%, var(--primary-text-color));`,
).join("");

// A card (or any element) sets data-state and everything inside follows --yvz-state*.
const stateSelectors = YVZ_STATES.map(
  (s) => `
  :host([data-state="${s}"]), [data-state="${s}"] {
    --yvz-state: var(--yvz-${s});
    --yvz-state-soft: var(--yvz-${s}-soft);
    --yvz-state-strong: var(--yvz-${s}-strong);
    --yvz-state-text: var(--yvz-${s}-text);
  }`,
).join("");

export const paletteStyles = css`
  :host {
    ${unsafeCSS(paletteTokens)}
  }
  ${unsafeCSS(stateSelectors)}
`;
