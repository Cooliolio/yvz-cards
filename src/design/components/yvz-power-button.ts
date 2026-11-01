import { css, html, LitElement, nothing, svg } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";
import type { ButtonStatus } from "./yvz-button";

export type PowerSize = "md" | "sm";

// A squircle power button in the surrounding state colour. It only draws; whoever uses it decides when
// a second tap is needed and sets `armed` while it waits (a "Sure?" face with a draining ring), or `waiting`
// while a sent command has no answer yet (a spinning ring), then reacts to the click.
@customElement("yvz-power-button")
export class YvzPowerButton extends LitElement {
  @property() icon = "mdi:power";
  @property() label = "";
  @property({ attribute: "confirm-label" }) confirmLabel = "";
  // How long the armed ring takes to drain, in ms.
  @property({ type: Number }) duration = 3000;
  @property({ reflect: true }) size: PowerSize = "md";
  @property({ type: Boolean, reflect: true }) armed = false;
  @property({ type: Boolean, reflect: true }) waiting = false;
  @property({ reflect: true }) status: ButtonStatus = "idle";
  @property({ type: Boolean, reflect: true }) disabled = false;

  static override styles = [
    designStyles,
    css`
      :host {
        --_size: 68px;
        --_icon: 28px;
        display: inline-block;
        flex: none;
        width: var(--_size);
        height: var(--_size);
      }

      :host([size="sm"]) {
        --_size: 44px;
        --_icon: 20px;
      }

      button {
        position: relative;
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        padding: 0;
        border: 0;
        border-radius: 35%;
        background: var(--yvz-state-soft, var(--yvz-accent-soft));
        color: var(--yvz-state, var(--yvz-accent));
        cursor: pointer;
        transition:
          background var(--yvz-duration-base) var(--yvz-ease),
          color var(--yvz-duration-base) var(--yvz-ease),
          box-shadow var(--yvz-duration-base) var(--yvz-ease),
          transform var(--yvz-duration-fast) var(--yvz-ease);
      }

      button:hover {
        background: var(--yvz-state-strong, var(--yvz-accent-strong));
      }

      button:active {
        transform: scale(var(--yvz-press-scale));
      }

      button:disabled {
        opacity: 0.5;
        cursor: default;
        pointer-events: none;
      }

      :host([armed]) button {
        background: var(--yvz-error-soft);
        color: var(--yvz-error);
        animation: armed 0.9s ease-in-out infinite;
      }

      :host([armed]) button:active {
        animation: none;
      }

      button.nudge {
        animation: nudge 0.35s ease-in-out;
      }

      .question {
        padding: 0 2px;
        font-size: 14px;
        font-weight: var(--yvz-weight-medium);
        line-height: 1;
        text-align: center;
      }

      :host([size="sm"]) .question {
        font-size: 11px;
      }

      .ring {
        position: absolute;
        inset: -4px;
        width: calc(100% + 8px);
        height: calc(100% + 8px);
        overflow: visible;
        pointer-events: none;
      }

      .ring rect {
        fill: none;
        stroke-width: 4;
        stroke-linecap: round;
      }

      .track {
        stroke: var(--yvz-divider);
      }

      .arc {
        stroke: var(--yvz-error);
        stroke-dasharray: 1;
        animation: drain var(--_duration) linear forwards;
      }

      .spin {
        stroke: var(--yvz-state, var(--yvz-accent));
        stroke-dasharray: 0.22 0.78;
        animation: spin 1.2s linear infinite;
      }

      @keyframes drain {
        from {
          stroke-dashoffset: 0;
        }
        to {
          stroke-dashoffset: 1;
        }
      }

      @keyframes spin {
        from {
          stroke-dashoffset: 0;
        }
        to {
          stroke-dashoffset: -1;
        }
      }

      @keyframes armed {
        0%,
        100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.06);
        }
      }

      @keyframes nudge {
        0%,
        100% {
          transform: translateX(0);
        }
        25% {
          transform: translateX(-4px);
        }
        75% {
          transform: translateX(4px);
        }
      }

      @keyframes dim {
        50% {
          opacity: 0.4;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        :host([armed]) button,
        .spin {
          animation: none;
        }

        /* A short dim instead of a shake, so an ignored tap still shows. */
        button.nudge {
          animation: dim 0.35s ease-in-out;
        }

        .spin {
          stroke-dasharray: 1;
        }
      }

      :host([status="success"]) button {
        background: var(--yvz-on-soft);
        color: var(--yvz-on);
      }

      :host([status="error"]) button {
        background: var(--yvz-error-soft);
        color: var(--yvz-error);
      }

      ha-icon {
        --mdc-icon-size: var(--_icon);
      }
    `,
  ];

  // A short shake for a tap that was ignored, so it is clear the press was noticed.
  nudge(): void {
    const button = this.renderRoot.querySelector("button");
    if (!button) return;
    button.classList.remove("nudge");
    void button.offsetWidth;
    button.classList.add("nudge");
  }

  private ring(kind: "arc" | "spin") {
    return html`<svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
      ${kind === "arc" ? svg`<rect class="track" x="2" y="2" width="96" height="96" rx="35" pathLength="1"></rect>` : nothing}
      <rect class=${kind === "arc" ? "arc" : "spin"} x="2" y="2" width="96" height="96" rx="35" pathLength="1"></rect>
    </svg>`;
  }

  protected override render() {
    const icon = this.status === "success" ? "mdi:check" : this.icon;
    return html`<button
      type="button"
      style="--_duration: ${this.duration}ms"
      ?disabled=${this.disabled}
      aria-label=${(this.armed && this.confirmLabel ? `${this.label}: ${this.confirmLabel}` : this.label) || nothing}
      aria-busy=${this.waiting}
      @animationend=${(e: AnimationEvent) => (e.animationName === "nudge" || e.animationName === "dim") && (e.currentTarget as HTMLElement).classList.remove("nudge")}
    >
      ${this.armed ? this.ring("arc") : this.waiting ? this.ring("spin") : nothing}
      ${this.armed && this.confirmLabel
        ? html`<span class="question">${this.confirmLabel}</span>`
        : html`<ha-icon .icon=${icon}></ha-icon>`}
    </button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-power-button": YvzPowerButton;
  }
}
