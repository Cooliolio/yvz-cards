import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";
import type { ButtonStatus } from "./yvz-button";

export type StepDirection = -1 | 1;

@customElement("yvz-stepper")
export class YvzStepper extends LitElement {
  @property() icon = "";
  @property() label = "";
  @property({ attribute: "decrease-label" }) decreaseLabel = "";
  @property({ attribute: "increase-label" }) increaseLabel = "";
  @property({ type: Boolean, reflect: true }) disabled = false;
  @property({ reflect: true }) status: ButtonStatus = "idle";

  static override styles = [
    designStyles,
    css`
      :host {
        display: flex;
        align-items: stretch;
        height: 40px;
        overflow: hidden;
        border-radius: var(--yvz-radius-md);
        background: var(--yvz-surface-raised);
        transition: background var(--yvz-duration-fast) var(--yvz-ease);
      }

      :host([status="success"]) {
        background: var(--yvz-on-strong);
      }

      :host([status="error"]) {
        background: var(--yvz-error-strong);
      }

      button {
        display: grid;
        flex: none;
        place-items: center;
        width: 48px;
        padding: 0;
        border: 0;
        background: none;
        color: var(--yvz-text);
        cursor: pointer;
        transition: background var(--yvz-duration-fast) var(--yvz-ease);
      }

      button:active {
        background: var(--yvz-state-strong, var(--yvz-accent-strong));
      }

      button:disabled {
        opacity: 0.5;
        cursor: default;
      }

      button:focus-visible {
        outline-offset: -2px;
      }

      .mid {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        gap: var(--yvz-space-1);
        min-width: 0;
        border-inline: 1px solid var(--yvz-divider);
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-body);
      }

      ha-icon {
        --mdc-icon-size: 18px;
      }

      .mid ha-icon {
        --mdc-icon-size: 16px;
      }
    `,
  ];

  private step(direction: StepDirection): void {
    this.dispatchEvent(
      new CustomEvent<{ direction: StepDirection }>("yvz-step", {
        detail: { direction },
        bubbles: true,
        composed: true,
      }),
    );
  }

  protected override render() {
    return html`
      <button
        type="button"
        ?disabled=${this.disabled}
        aria-label=${this.decreaseLabel || nothing}
        @click=${() => this.step(-1)}
      >
        <ha-icon icon="mdi:minus"></ha-icon>
      </button>
      <span class="mid">
        <slot>${this.icon ? html`<ha-icon .icon=${this.icon}></ha-icon>` : nothing}${this.label}</slot>
      </span>
      <button
        type="button"
        ?disabled=${this.disabled}
        aria-label=${this.increaseLabel || nothing}
        @click=${() => this.step(1)}
      >
        <ha-icon icon="mdi:plus"></ha-icon>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-stepper": YvzStepper;
  }
}
