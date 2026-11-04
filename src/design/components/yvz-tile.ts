import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { YvzState } from "../palette";
import { designStyles } from "../styles";

export interface TileBadge {
  icon: string;
  // Tints the icon; ignored while the tile is selected so it stays readable on the fill.
  state?: YvzState;
  // Takes the surrounding --yvz-state colour instead, for a tile that sets its own.
  tint?: boolean;
}

// Tappable tile for a grid of choices: label on top, a value below, small badges in the corner.
// Selected tiles fill with --yvz-state, like an active button.
@customElement("yvz-tile")
export class YvzTile extends LitElement {
  @property() label = "";
  @property() value = "";
  // Shows this many dots instead of the value, `level` of them lit (e.g. a heater setting).
  @property({ type: Number }) steps = 0;
  @property({ type: Number }) level = 0;
  // What a screen reader says for the dots.
  @property({ attribute: "value-text" }) valueText = "";
  @property({ attribute: false }) badges: TileBadge[] = [];
  @property({ type: Boolean, reflect: true }) selected = false;
  @property({ type: Boolean, reflect: true }) disabled = false;
  // For a source that isn't reporting: still selectable, but visibly faded.
  @property({ type: Boolean, reflect: true }) muted = false;
  // Transparent with a thin border until selected.
  @property({ type: Boolean, reflect: true }) outline = false;
  // Draws attention without a loud fill: soft --yvz-state background, a 2px ring and text in --yvz-state-text (the
  // plain state colours are too pale for a ring on a light card).
  @property({ type: Boolean, reflect: true }) attention = false;
  // Waiting for something: the first badge spins.
  @property({ type: Boolean, reflect: true }) busy = false;
  // Milliseconds left to answer; draws a bar along the bottom that drains over this time.
  @property({ type: Number }) countdown = 0;

  static override styles = [
    designStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }

      button {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: var(--yvz-space-2);
        width: 100%;
        min-height: var(--yvz-tile-height, 76px);
        padding: var(--yvz-tile-padding, var(--yvz-space-3));
        border: 0;
        border-radius: var(--yvz-radius-md);
        background: var(--yvz-surface-raised);
        color: var(--yvz-text);
        font: inherit;
        text-align: start;
        cursor: pointer;
        transition:
          background var(--yvz-duration-base) var(--yvz-ease),
          color var(--yvz-duration-base) var(--yvz-ease),
          box-shadow var(--yvz-duration-base) var(--yvz-ease),
          transform var(--yvz-duration-fast) var(--yvz-ease);
      }

      button:hover {
        background: color-mix(in srgb, var(--yvz-surface-raised) 85%, var(--yvz-text));
      }

      button:active {
        transform: scale(var(--yvz-press-scale));
      }

      :host([outline]) button {
        background: none;
        box-shadow: inset 0 0 0 1px var(--yvz-divider);
      }

      :host([outline]) button:hover {
        background: color-mix(in srgb, var(--yvz-text) 6%, transparent);
      }

      :host([selected]) button {
        background: var(--yvz-state, var(--yvz-accent));
        box-shadow: none;
        color: var(--yvz-on-state, #fff);
      }

      /* a disabled selection keeps its place but drops the loud fill */
      :host([selected][disabled]) button {
        background: var(--yvz-state-soft, var(--yvz-accent-soft));
        color: var(--yvz-text);
      }

      button:disabled {
        cursor: default;
        pointer-events: none;
      }

      /* a card can set these to keep a disabled tile readable instead of fading it */
      :host([disabled]:not([selected])) button {
        opacity: var(--yvz-tile-disabled-opacity, 0.55);
        color: var(--yvz-tile-disabled-color, inherit);
      }

      :host([muted]) button {
        opacity: 0.55;
      }

      :host([attention]) button {
        position: relative;
        overflow: hidden;
        background: var(--yvz-state-soft, var(--yvz-accent-soft));
        box-shadow: inset 0 0 0 2px var(--yvz-state-text, var(--yvz-accent-text));
        color: var(--yvz-state-text, var(--yvz-accent-text));
        font-weight: var(--yvz-weight-medium);
      }

      :host([attention]) ha-icon {
        color: inherit;
      }

      :host([busy]) ha-icon:first-of-type {
        animation: spin 1s linear infinite;
      }

      .timer {
        position: absolute;
        inset: auto 0 0 0;
        height: 3px;
        background: var(--yvz-state-text, var(--yvz-accent-text));
        transform-origin: left;
        animation: drain var(--_countdown) linear forwards;
        pointer-events: none;
      }

      @keyframes drain {
        from {
          transform: scaleX(1);
        }
        to {
          transform: scaleX(0);
        }
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        :host([busy]) ha-icon:first-of-type {
          animation: none;
        }

        .timer {
          animation: none;
          transform: scaleX(0.5);
        }
      }

      .top {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-1);
        min-width: 0;
      }

      .label {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        font-size: var(--yvz-text-body);
        line-height: var(--yvz-line-body);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      ha-icon {
        --mdc-icon-size: 16px;
        flex: none;
        color: var(--yvz-text-muted);
      }

      ha-icon[data-state],
      ha-icon[data-tint] {
        color: var(--yvz-state);
      }

      :host([selected]) ha-icon {
        color: inherit;
      }

      .dots {
        display: flex;
        align-items: center;
        gap: 5px;
        height: var(--yvz-tile-value-line, var(--yvz-line-value));
      }

      .dots i {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
        opacity: 0.25;
        transition: opacity var(--yvz-duration-base) var(--yvz-ease);
      }

      .dots i.lit {
        opacity: 1;
      }

      .value {
        font-size: var(--yvz-tile-value-size, var(--yvz-text-value));
        font-weight: var(--yvz-weight-medium);
        font-variant-numeric: tabular-nums;
        line-height: var(--yvz-tile-value-line, var(--yvz-line-value));
      }
    `,
  ];

  protected override render() {
    const aria = this.valueText ? `${this.label}: ${this.valueText}` : nothing;
    return html`<button
      type="button"
      ?disabled=${this.disabled}
      aria-pressed=${this.selected}
      aria-busy=${this.busy ? "true" : nothing}
      aria-label=${aria}
      style=${this.countdown > 0 ? `--_countdown: ${this.countdown}ms` : nothing}
    >
      <span class="top">
        <span class="label">${this.label}</span>
        ${this.badges.map((b) => html`<ha-icon .icon=${b.icon} data-state=${b.state ?? nothing} data-tint=${b.tint ? "" : nothing}></ha-icon>`)}
      </span>
      ${this.steps > 0
        ? html`<span class="dots" aria-hidden="true"
            >${Array.from({ length: this.steps }, (_, i) => html`<i class=${i < this.level ? "lit" : ""}></i>`)}</span
          >`
        : this.value
          ? html`<span class="value">${this.value}</span>`
          : nothing}
      ${this.countdown > 0 ? html`<span class="timer" aria-hidden="true"></span>` : nothing}
    </button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-tile": YvzTile;
  }
}
