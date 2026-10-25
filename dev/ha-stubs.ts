import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import * as mdi from "@mdi/js";

// Stand-ins for the HA frontend elements our cards rely on.
@customElement("ha-card")
export class HaCardStub extends LitElement {
  static override styles = css`
    :host {
      display: block;
      overflow: hidden;
      border: 1px solid var(--ha-card-border-color, var(--divider-color));
      border-radius: var(--ha-card-border-radius, 12px);
      background: var(--ha-card-background, var(--card-background-color));
    }
  `;

  protected override render() {
    return html`<slot></slot>`;
  }
}

const pascal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

@customElement("ha-icon")
export class HaIconStub extends LitElement {
  @property() icon = "";

  static override styles = css`
    :host {
      display: inline-flex;
      width: var(--mdc-icon-size, 24px);
      height: var(--mdc-icon-size, 24px);
    }

    svg {
      width: 100%;
      height: 100%;
      fill: currentColor;
    }
  `;

  protected override render() {
    const key = "mdi" + this.icon.replace(/^mdi:/, "").split("-").map(pascal).join("");
    const path = (mdi as unknown as Record<string, string>)[key] ?? "";
    return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d=${path}></path></svg>`;
  }
}
