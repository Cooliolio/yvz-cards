import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { designStyles } from "../styles";
import type { ButtonStatus } from "./yvz-button";

// A number that shows as plain text and turns into a small input when tapped, for typing an exact value
// next to − and + buttons. Enter or leaving the field emits yvz-change; Escape cancels.
@customElement("yvz-number-field")
export class YvzNumberField extends LitElement {
  @property({ type: Number }) value?: number;
  @property({ type: Number }) min?: number;
  @property({ type: Number }) max?: number;
  @property({ type: Number }) step = 1;
  @property() unit = "";
  @property() label = "";
  @property({ type: Boolean, reflect: true }) disabled = false;
  // Flashes the number green or red after a command was sent, like yvz-button.
  @property({ reflect: true }) status: ButtonStatus = "idle";
  @state() private editing = false;

  static override styles = [
    designStyles,
    css`
      :host {
        display: inline-flex;
        min-width: 0;
      }

      button,
      input {
        min-width: 3.5ch;
        height: 28px;
        padding: 0 var(--yvz-space-2);
        border: 0;
        border-radius: var(--yvz-radius-sm);
        font: inherit;
        font-size: var(--yvz-text-body);
        font-variant-numeric: tabular-nums;
        text-align: end;
      }

      button {
        background: none;
        color: var(--yvz-text);
        font-weight: var(--yvz-weight-medium);
        cursor: pointer;
        transition:
          background var(--yvz-duration-fast) var(--yvz-ease),
          color var(--yvz-duration-fast) var(--yvz-ease);
      }

      button:hover {
        background: var(--yvz-surface-raised);
      }

      button:disabled {
        opacity: 0.5;
        cursor: default;
        pointer-events: none;
      }

      :host([status="success"]) button {
        color: var(--yvz-on-text);
      }

      :host([status="error"]) button {
        color: var(--yvz-error-text);
      }

      input {
        width: 6ch;
        background: var(--yvz-surface-raised);
        color: var(--yvz-text);
        -moz-appearance: textfield;
        appearance: textfield;
      }

      input::-webkit-outer-spin-button,
      input::-webkit-inner-spin-button {
        margin: 0;
        -webkit-appearance: none;
      }
    `,
  ];

  private async open(): Promise<void> {
    this.editing = true;
    await this.updateComplete;
    const input = this.renderRoot.querySelector("input");
    input?.focus();
    input?.select();
  }

  private commit(input: HTMLInputElement): void {
    if (!this.editing) return;
    this.editing = false;
    let value = parseFloat(input.value.replace(",", "."));
    if (Number.isNaN(value)) return;
    if (this.min != null) value = Math.max(this.min, value);
    if (this.max != null) value = Math.min(this.max, value);
    if (value === this.value) return;
    this.dispatchEvent(new CustomEvent("yvz-change", { detail: { value }, bubbles: true, composed: true }));
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === "Enter") this.commit(e.target as HTMLInputElement);
    else if (e.key === "Escape") this.editing = false;
  }

  protected override render() {
    if (this.editing) {
      return html`<input
        type="number"
        inputmode="decimal"
        aria-label=${this.label}
        .value=${this.value == null ? "" : String(this.value)}
        min=${this.min ?? ""}
        max=${this.max ?? ""}
        step=${this.step}
        @keydown=${this.onKey}
        @blur=${(e: FocusEvent) => this.commit(e.target as HTMLInputElement)}
      />`;
    }
    const text = this.value == null ? "—" : `${this.value}${this.unit}`;
    return html`<button type="button" ?disabled=${this.disabled} aria-label=${this.label} title=${this.label} @click=${this.open}>${text}</button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-number-field": YvzNumberField;
  }
}
