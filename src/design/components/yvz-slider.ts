import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";

// Horizontal slider on a native range input, so keyboard, touch and screen readers just work.
// Emits yvz-input with the value while dragging and yvz-change once it is let go.
@customElement("yvz-slider")
export class YvzSlider extends LitElement {
  @property({ type: Number }) value = 0;
  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 100;
  @property({ type: Number }) step = 1;
  @property() label = "";
  @property({ type: Boolean, reflect: true }) disabled = false;

  static override styles = [
    designStyles,
    css`
      :host {
        display: flex;
        align-items: center;
        min-width: 0;
        height: var(--yvz-slider-height, 32px);
      }

      input {
        --_thumb: 20px;
        --_fill: var(--yvz-state, var(--yvz-accent));
        flex: 1;
        min-width: 0;
        height: 100%;
        margin: 0;
        background: none;
        cursor: pointer;
        appearance: none;
        -webkit-tap-highlight-color: transparent;
      }

      input:disabled {
        opacity: 0.5;
        cursor: default;
      }

      input:focus-visible {
        outline-offset: 0;
      }

      /* the fill is a hard-stop gradient driven by --_pct, so no extra element is needed */
      input::-webkit-slider-runnable-track {
        height: 4px;
        border-radius: var(--yvz-radius-pill);
        background: linear-gradient(var(--_fill), var(--_fill)) 0 / var(--_pct) 100% no-repeat var(--yvz-divider);
      }

      input::-moz-range-track {
        height: 4px;
        border-radius: var(--yvz-radius-pill);
        background: linear-gradient(var(--_fill), var(--_fill)) 0 / var(--_pct) 100% no-repeat var(--yvz-divider);
      }

      input::-webkit-slider-thumb {
        width: var(--_thumb);
        height: var(--_thumb);
        margin-top: calc((4px - var(--_thumb)) / 2);
        border: 0;
        border-radius: 50%;
        background: var(--_fill);
        box-shadow: 0 0 0 4px transparent;
        transition:
          box-shadow var(--yvz-duration-fast) var(--yvz-ease),
          transform var(--yvz-duration-fast) var(--yvz-ease);
        appearance: none;
      }

      input::-moz-range-thumb {
        width: var(--_thumb);
        height: var(--_thumb);
        border: 0;
        border-radius: 50%;
        background: var(--_fill);
        box-shadow: 0 0 0 4px transparent;
        transition:
          box-shadow var(--yvz-duration-fast) var(--yvz-ease),
          transform var(--yvz-duration-fast) var(--yvz-ease);
      }

      input:hover::-webkit-slider-thumb {
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--_fill) 20%, transparent);
      }

      input:hover::-moz-range-thumb {
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--_fill) 20%, transparent);
      }

      input:active::-webkit-slider-thumb {
        box-shadow: 0 0 0 6px color-mix(in srgb, var(--_fill) 25%, transparent);
        transform: scale(var(--yvz-press-scale));
      }

      input:active::-moz-range-thumb {
        box-shadow: 0 0 0 6px color-mix(in srgb, var(--_fill) 25%, transparent);
        transform: scale(var(--yvz-press-scale));
      }
    `,
  ];

  private emit(name: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.value = value;
    this.dispatchEvent(new CustomEvent(name, { detail: { value }, bubbles: true, composed: true }));
  }

  protected override render() {
    const span = this.max - this.min || 1;
    const pct = Math.min(100, Math.max(0, ((this.value - this.min) / span) * 100));
    return html`<input
      type="range"
      aria-label=${this.label}
      style="--_pct: ${pct}%"
      min=${this.min}
      max=${this.max}
      step=${this.step}
      .value=${String(this.value)}
      ?disabled=${this.disabled}
      @input=${(e: Event) => this.emit("yvz-input", e)}
      @change=${(e: Event) => this.emit("yvz-change", e)}
    />`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-slider": YvzSlider;
  }
}
