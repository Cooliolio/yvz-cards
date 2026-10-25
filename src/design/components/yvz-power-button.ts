import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { designStyles } from "../styles";
import type { ButtonStatus } from "./yvz-button";

export type PowerEmphasis = "none" | "glow" | "pulse";

const RING_RADIUS = 41;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

@customElement("yvz-power-button")
export class YvzPowerButton extends LitElement {
  @property() icon = "mdi:power";
  @property() label = "";
  @property({ attribute: "confirm-label" }) confirmLabel = "";
  @property({ type: Number }) duration = 3000;
  @property({ reflect: true }) emphasis: PowerEmphasis = "none";
  @property({ reflect: true }) status: ButtonStatus = "idle";
  @property({ type: Boolean, reflect: true }) disabled = false;
  @state() private armed = false;

  private timer?: ReturnType<typeof setTimeout>;

  static override styles = [
    designStyles,
    css`
      :host {
        position: relative;
        display: inline-block;
        flex: none;
        width: 76px;
        height: 76px;
      }

      button {
        position: relative;
        display: block;
        width: 100%;
        height: 100%;
        padding: 0;
        border: 0;
        background: none;
        color: inherit;
        font: inherit;
        cursor: pointer;
      }

      button:disabled {
        opacity: 0.5;
        cursor: default;
      }

      .face {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: var(--yvz-state, var(--yvz-accent));
        color: #fff;
        transition:
          background var(--yvz-duration-base) var(--yvz-ease),
          transform var(--yvz-duration-fast) var(--yvz-ease);
      }

      button:active .face {
        transform: scale(var(--yvz-press-scale));
      }

      :host([emphasis="glow"]) .face {
        box-shadow:
          0 0 0 6px var(--yvz-state-soft),
          0 0 22px var(--yvz-state-strong);
      }

      :host([emphasis="pulse"]) .face {
        animation: pulse 1.6s ease-in-out infinite;
      }

      :host([status="success"]) .face {
        background: var(--yvz-on);
      }

      :host([status="error"]) .face {
        background: var(--yvz-error);
      }

      .armed .face {
        background: var(--yvz-surface-raised);
        color: var(--yvz-state, var(--yvz-accent));
        box-shadow: none;
        animation: none;
      }

      ha-icon {
        --mdc-icon-size: 36px;
      }

      .question {
        font-size: var(--yvz-text-body);
        font-weight: var(--yvz-weight-medium);
      }

      .ring {
        position: absolute;
        inset: -6px;
        width: 88px;
        height: 88px;
        transform: rotate(-90deg);
        pointer-events: none;
      }

      .ring circle {
        fill: none;
        stroke-width: 3;
      }

      .track {
        stroke: var(--yvz-divider);
      }

      .arc {
        stroke: var(--yvz-text);
        stroke-linecap: round;
        stroke-dasharray: ${RING_LENGTH};
        animation: drain var(--_duration) linear forwards;
      }

      @keyframes drain {
        from {
          stroke-dashoffset: 0;
        }
        to {
          stroke-dashoffset: ${RING_LENGTH};
        }
      }

      @keyframes pulse {
        0%,
        100% {
          box-shadow: 0 0 0 0 var(--yvz-state-strong);
        }
        50% {
          box-shadow: 0 0 0 10px transparent;
        }
      }
    `,
  ];

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.disarm();
  }

  disarm(): void {
    clearTimeout(this.timer);
    this.setArmed(false);
  }

  private setArmed(armed: boolean): void {
    if (this.armed === armed) return;
    this.armed = armed;
    this.dispatchEvent(
      new CustomEvent("yvz-armed-change", { detail: { armed }, bubbles: true, composed: true }),
    );
  }

  private onClick(): void {
    if (!this.armed) {
      this.setArmed(true);
      this.timer = setTimeout(() => this.disarm(), this.duration);
      return;
    }
    this.disarm();
    this.dispatchEvent(new CustomEvent("yvz-confirm", { bubbles: true, composed: true }));
  }

  protected override render() {
    const icon = this.status === "success" ? "mdi:check" : this.icon;
    return html`
      <button
        type="button"
        class=${this.armed ? "armed" : ""}
        style="--_duration: ${this.duration}ms"
        ?disabled=${this.disabled}
        aria-label=${this.label || nothing}
        @click=${this.onClick}
      >
        ${this.armed
          ? html`<svg class="ring" viewBox="0 0 88 88" aria-hidden="true">
              <circle class="track" cx="44" cy="44" r=${RING_RADIUS}></circle>
              <circle class="arc" cx="44" cy="44" r=${RING_RADIUS}></circle>
            </svg>`
          : nothing}
        <span class="face">
          ${this.armed
            ? html`<span class="question">${this.confirmLabel}</span>`
            : html`<ha-icon .icon=${icon}></ha-icon>`}
        </span>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-power-button": YvzPowerButton;
  }
}
