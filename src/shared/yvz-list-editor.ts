import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { HaFormSchema, HomeAssistant } from "./types";

type Item = Record<string, unknown>;

// Add / remove / reorder list of ha-form items; HA has no generic editor for this.
@customElement("yvz-list-editor")
export class YvzListEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) items: Item[] = [];
  @property({ attribute: false }) schema: HaFormSchema[] = [];
  @property({ attribute: false }) computeLabel: (schema: HaFormSchema) => string = (s) => s.name;
  @property({ attribute: false }) itemTitle: (item: Item, index: number) => string = (_, i) => String(i + 1);
  @property() addLabel = "";
  @property() removeLabel = "";
  @property() moveUpLabel = "";
  @property() moveDownLabel = "";

  static override styles = css`
    :host {
      display: block;
    }

    .item {
      margin-bottom: 12px;
      border: 1px solid var(--divider-color);
      border-radius: 8px;
    }

    .bar {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 4px 4px 12px;
      border-bottom: 1px solid var(--divider-color);
    }

    .title {
      flex: 1;
      overflow: hidden;
      font-weight: 500;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 6px 8px;
      border: 0;
      border-radius: 8px;
      background: none;
      color: var(--primary-text-color);
      font: inherit;
      cursor: pointer;
    }

    button:hover:not(:disabled) {
      background: var(--secondary-background-color);
    }

    button:disabled {
      opacity: 0.35;
      cursor: default;
    }

    button.danger {
      color: var(--error-color);
    }

    button.add {
      color: var(--primary-color);
    }

    ha-form {
      display: block;
      padding: 12px;
    }

    ha-icon {
      --mdc-icon-size: 20px;
    }
  `;

  private emit(items: Item[]): void {
    this.dispatchEvent(new CustomEvent("items-changed", { detail: { items }, bubbles: true, composed: true }));
  }

  private replace(index: number, value: Item): void {
    this.emit(this.items.map((item, i) => (i === index ? value : item)));
  }

  private move(index: number, by: -1 | 1): void {
    const next = [...this.items];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    this.emit(next);
  }

  protected override render() {
    return html`
      ${this.items.map(
        (item, i) => html`
          <div class="item">
            <div class="bar">
              <span class="title">${this.itemTitle(item, i)}</span>
              <button type="button" aria-label=${this.moveUpLabel || nothing} ?disabled=${i === 0} @click=${() => this.move(i, -1)}>
                <ha-icon icon="mdi:arrow-up"></ha-icon>
              </button>
              <button
                type="button"
                aria-label=${this.moveDownLabel || nothing}
                ?disabled=${i === this.items.length - 1}
                @click=${() => this.move(i, 1)}
              >
                <ha-icon icon="mdi:arrow-down"></ha-icon>
              </button>
              <button
                type="button"
                class="danger"
                aria-label=${this.removeLabel || nothing}
                @click=${() => this.emit(this.items.filter((_, n) => n !== i))}
              >
                <ha-icon icon="mdi:delete-outline"></ha-icon>
              </button>
            </div>
            <ha-form
              .hass=${this.hass}
              .data=${item}
              .schema=${this.schema}
              .computeLabel=${this.computeLabel}
              @value-changed=${(e: CustomEvent<{ value: Item }>) => {
                e.stopPropagation();
                this.replace(i, e.detail.value);
              }}
            ></ha-form>
          </div>
        `,
      )}
      <button type="button" class="add" @click=${() => this.emit([...this.items, {}])}>
        <ha-icon icon="mdi:plus"></ha-icon>${this.addLabel}
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-list-editor": YvzListEditor;
  }
}
