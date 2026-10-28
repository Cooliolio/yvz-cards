import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { designStyles } from "../styles";

const RETRY_MS = 8000;

// A camera picture. It drops the stream when the card leaves the page, shows a placeholder when there is
// no picture, and asks for a new address (yvz-retry) a few seconds after the stream breaks.
// Anything in the "overlay" slot sits in the top left corner.
@customElement("yvz-camera")
export class YvzCamera extends LitElement {
  @property() src = "";
  // Shown when there is no picture.
  @property() label = "";
  @state() private failed = false;
  @state() private live = true;

  private retry?: ReturnType<typeof setTimeout>;

  static override styles = [
    designStyles,
    css`
      :host {
        display: block;
        position: relative;
        overflow: hidden;
        border-radius: var(--yvz-radius-md);
        background: var(--yvz-surface-raised);
        aspect-ratio: 16 / 9;
        min-width: 0;
      }

      img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .none {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--yvz-space-2);
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
      }

      ha-icon {
        --mdc-icon-size: 18px;
      }

      .overlay {
        position: absolute;
        top: var(--yvz-space-2);
        inset-inline-start: var(--yvz-space-2);
      }

      /* readable on any picture, so a fixed dark pill rather than a theme colour */
      ::slotted([slot="overlay"]) {
        display: block;
        padding: 2px var(--yvz-space-2);
        border-radius: var(--yvz-radius-sm);
        background: rgb(0 0 0 / 0.55);
        color: #fff;
        font-size: var(--yvz-text-label);
        font-variant-numeric: tabular-nums;
        font-weight: var(--yvz-weight-medium);
        line-height: var(--yvz-line-label);
      }
    `,
  ];

  override connectedCallback(): void {
    super.connectedCallback();
    this.live = true;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.retry);
    // No picture while away, so the browser closes the stream.
    this.live = false;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("src")) {
      clearTimeout(this.retry);
      this.failed = false;
    }
  }

  private onError(): void {
    this.failed = true;
    clearTimeout(this.retry);
    this.retry = setTimeout(() => this.dispatchEvent(new CustomEvent("yvz-retry", { bubbles: true, composed: true })), RETRY_MS);
  }

  protected override render() {
    const showing = this.src && this.live && !this.failed;
    return html`
      ${showing ? html`<img src=${this.src} alt="" draggable="false" @error=${this.onError} />` : html`<div class="none"><ha-icon icon="mdi:camera-off"></ha-icon>${this.label}</div>`}
      <div class="overlay"><slot name="overlay"></slot></div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-camera": YvzCamera;
  }
}
