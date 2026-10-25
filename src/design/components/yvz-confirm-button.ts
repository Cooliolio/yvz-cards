import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { designStyles } from "../styles";
import type { ButtonStatus, ButtonTone } from "./yvz-button";
import "./yvz-button";

@customElement("yvz-confirm-button")
export class YvzConfirmButton extends LitElement {
  @property() icon = "";
  @property() label = "";
  @property({ attribute: "confirm-label" }) confirmLabel = "";
  @property({ reflect: true }) tone: ButtonTone = "danger";
  @property({ reflect: true }) status: ButtonStatus = "idle";
  @property({ type: Number }) duration = 3000;
  @property({ type: Boolean, reflect: true }) disabled = false;
  @state() private armed = false;

  private timer?: ReturnType<typeof setTimeout>;

  static override styles = [
    designStyles,
    css`
      :host {
        display: block;
      }

      .wrap {
        position: relative;
        overflow: hidden;
        border-radius: var(--yvz-radius-md);
      }

      .timer {
        position: absolute;
        inset: auto 0 0 0;
        height: 3px;
        background: #fff;
        opacity: 0.7;
        transform-origin: left;
        animation: drain var(--_duration) linear forwards;
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
    `,
  ];

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.disarm();
  }

  disarm(): void {
    clearTimeout(this.timer);
    this.armed = false;
  }

  private onClick(): void {
    if (!this.armed) {
      this.armed = true;
      this.timer = setTimeout(() => this.disarm(), this.duration);
      return;
    }
    this.disarm();
    this.dispatchEvent(new CustomEvent("yvz-confirm", { bubbles: true, composed: true }));
  }

  protected override render() {
    return html`
      <div class="wrap" style="--_duration: ${this.duration}ms">
        <yvz-button
          .icon=${this.icon}
          .tone=${this.tone}
          .status=${this.status}
          ?active=${this.armed}
          ?disabled=${this.disabled}
          @click=${this.onClick}
        >
          ${this.armed ? this.confirmLabel || this.label : this.label}
        </yvz-button>
        ${this.armed ? html`<span class="timer"></span>` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-confirm-button": YvzConfirmButton;
  }
}
