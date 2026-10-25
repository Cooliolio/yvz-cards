import { css, html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { designStyles } from "../styles";

// Small uppercase heading above a group; anything in the "end" slot sits on the right.
@customElement("yvz-section-title")
export class YvzSectionTitle extends LitElement {
  static override styles = [
    designStyles,
    css`
      :host {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--yvz-space-2);
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-caption);
        line-height: var(--yvz-line-caption);
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      slot[name="end"] {
        flex: none;
        letter-spacing: normal;
        text-transform: none;
      }
    `,
  ];

  protected override render() {
    return html`<span class="title" role="heading" aria-level="3"><slot></slot></span><slot name="end"></slot>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-section-title": YvzSectionTitle;
  }
}
