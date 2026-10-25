import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { HoldRepeat } from "../hold-repeat";
import { designStyles } from "../styles";
import { reducedMotion } from "../tween";

// Round button. Plain: borderless, for secondary actions such as settings or close.
// Raised: filled and a bit larger, for primary controls such as −/+ on a dial.
@customElement("yvz-icon-button")
export class YvzIconButton extends LitElement {
  @property() icon = "";
  @property() label = "";
  @property({ type: Boolean, reflect: true }) disabled = false;
  @property({ type: Boolean, reflect: true }) raised = false;
  // While held, fires yvz-repeat (see HoldRepeat).
  @property({ type: Boolean }) repeat = false;

  private hold = new HoldRepeat(this, () => this.repeat && !this.disabled);

  static override styles = [
    designStyles,
    css`
      :host {
        display: inline-flex;
        flex: none;
      }

      button {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: none;
        color: var(--yvz-text-muted);
        cursor: pointer;
        transition:
          background var(--yvz-duration-fast) var(--yvz-ease),
          color var(--yvz-duration-fast) var(--yvz-ease),
          box-shadow var(--yvz-duration-fast) var(--yvz-ease),
          transform var(--yvz-duration-fast) var(--yvz-ease);
      }

      button:hover {
        background: var(--yvz-surface-raised);
        color: var(--yvz-text);
      }

      :host([raised]) button {
        width: var(--yvz-icon-button-size, 40px);
        height: var(--yvz-icon-button-size, 40px);
        background: var(--yvz-surface-raised);
        color: var(--yvz-text);
      }

      :host([raised]) button:hover {
        box-shadow: inset 0 0 0 1.5px var(--yvz-state, var(--yvz-accent));
      }

      :host([raised]) button:active {
        background: var(--yvz-state-soft, var(--yvz-accent-soft));
        transform: scale(var(--yvz-press-scale));
      }

      button:disabled {
        opacity: 0.5;
        pointer-events: none;
      }

      ha-icon {
        --mdc-icon-size: 22px;
      }
    `,
  ];

  // A new icon turns in rather than popping, e.g. cog → close; the first icon just appears.
  protected override updated(changed: PropertyValues<this>): void {
    if (!changed.has("icon") || !changed.get("icon") || reducedMotion()) return;
    this.renderRoot.querySelector("ha-icon")?.animate(
      [
        { opacity: 0, transform: "rotate(-90deg) scale(0.6)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 200, easing: "ease-out" },
    );
  }

  protected override render() {
    return html`<button
      type="button"
      ?disabled=${this.disabled}
      aria-label=${this.label}
      title=${this.label}
      @pointerdown=${this.hold.start}
      @pointerup=${this.hold.release}
      @pointerleave=${this.hold.abandon}
      @pointercancel=${this.hold.abandon}
    >
      <ha-icon .icon=${this.icon}></ha-icon>
    </button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-icon-button": YvzIconButton;
  }
}
