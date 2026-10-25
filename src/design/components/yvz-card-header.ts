import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { designStyles } from "../styles";
import "./yvz-icon-badge";

@customElement("yvz-card-header")
export class YvzCardHeader extends LitElement {
  @property() icon = "";
  @property() heading = "";
  @property() subtitle = "";

  static override styles = [
    designStyles,
    css`
      :host {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-3);
        min-height: 34px;
      }

      .text {
        flex: 1;
        min-width: 0;
      }

      .title {
        overflow: hidden;
        color: var(--yvz-text);
        font-size: var(--yvz-text-title);
        font-weight: var(--yvz-weight-medium);
        line-height: var(--yvz-line-label);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .subtitle {
        display: flex;
        align-items: center;
        gap: var(--yvz-space-2);
        margin-top: 2px;
        color: var(--yvz-text-muted);
        font-size: var(--yvz-text-label);
        line-height: var(--yvz-line-label);
      }

      .dot {
        flex: none;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--yvz-state, var(--yvz-accent));
        transition: background var(--yvz-duration-base) var(--yvz-ease);
      }

      .subtitle span:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      slot[name="end"] {
        display: flex;
        flex: none;
        align-items: center;
        gap: var(--yvz-space-2);
      }
    `,
  ];

  protected override render() {
    return html`
      <yvz-icon-badge .icon=${this.icon}></yvz-icon-badge>
      <div class="text">
        <div class="title">${this.heading}</div>
        ${this.subtitle
          ? html`<div class="subtitle"><span class="dot"></span><span>${this.subtitle}</span></div>`
          : nothing}
      </div>
      <slot name="end"></slot>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-card-header": YvzCardHeader;
  }
}
