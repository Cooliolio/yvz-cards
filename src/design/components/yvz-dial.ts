import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { designStyles } from "../styles";

const START = 150;
const SWEEP = 240;
const R = 95;
const CX = 120;
const CY = 118;
const WIDTH = 240;
const HEIGHT = 202;
// How far past each end of the arc the start/end slots sit, along the same circle.
const SLOT_GAP = 18;

const point = (deg: number): [number, number] => [
  CX + R * Math.cos((deg * Math.PI) / 180),
  CY + R * Math.sin((deg * Math.PI) / 180),
];

const [SX, SY] = point(START);
const [EX, EY] = point(START + SWEEP);
const ARC = `M${SX.toFixed(1)} ${SY.toFixed(1)} A${R} ${R} 0 1 1 ${EX.toFixed(1)} ${EY.toFixed(1)}`;

const slotAt = (deg: number) => {
  const [x, y] = point(deg);
  return `left: ${((x / WIDTH) * 100).toFixed(2)}%; top: ${((y / HEIGHT) * 100).toFixed(2)}%`;
};
const START_SLOT = slotAt(START - SLOT_GAP);
const END_SLOT = slotAt(START + SWEEP + SLOT_GAP);

// Open 240° arc: the fill shows the value, the knob shows the target, the default slot sits in the
// middle. The "start" and "end" slots sit just past the low and high ends of the arc, e.g. for −/+.
// Colour follows --yvz-state; with ambient, a faint wash of it glows behind the dial.
@customElement("yvz-dial")
export class YvzDial extends LitElement {
  @property({ type: Number }) value?: number;
  @property({ type: Number }) target?: number;
  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 100;
  @property({ type: Boolean, reflect: true }) ambient = false;
  // Fill and knob start at zero and sweep to their values once the dial is on screen.
  @state() private ready = false;
  // Where the knob was last, so it can fade out in place when the target goes away.
  private lastKnob = 0;

  static override styles = [
    designStyles,
    css`
      :host {
        display: block;
        position: relative;
        width: 100%;
        max-width: 300px;
        margin: 0 auto;
      }

      svg {
        position: relative;
        display: block;
        width: 100%;
        overflow: visible;
      }

      .ambient {
        position: absolute;
        inset: -10% -15% 0;
        background-color: var(--yvz-state, var(--yvz-accent));
        opacity: 0;
        mask-image: radial-gradient(closest-side at 50% 58%, #000, transparent);
        pointer-events: none;
        transition:
          opacity var(--yvz-duration-slow) var(--yvz-ease),
          background-color var(--yvz-duration-slow) var(--yvz-ease);
      }

      :host([ambient]) .ambient {
        opacity: 0.12;
      }

      path {
        fill: none;
        stroke-width: 5;
        stroke-linecap: round;
      }

      .track {
        stroke: var(--yvz-surface-raised);
      }

      .fill {
        stroke: var(--yvz-state, var(--yvz-accent));
        transition:
          stroke-dasharray var(--yvz-duration-slow) var(--yvz-ease),
          stroke var(--yvz-duration-base) var(--yvz-ease),
          opacity var(--yvz-duration-fast) var(--yvz-ease);
      }

      .knob {
        transform-box: view-box;
        transform-origin: ${CX}px ${CY}px;
        transition:
          transform var(--yvz-duration-slow) var(--yvz-ease),
          opacity var(--yvz-duration-base) var(--yvz-ease);
      }

      circle {
        fill: var(--yvz-surface);
        stroke: var(--yvz-state, var(--yvz-accent));
        stroke-width: 3;
        transition: stroke var(--yvz-duration-base) var(--yvz-ease);
      }

      .center {
        position: absolute;
        z-index: 1;
        inset: 22% 18% 6%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
      }

      .cap {
        position: absolute;
        z-index: 1;
        display: flex;
        transform: translate(-50%, -50%);
      }

      ::slotted(*) {
        --yvz-icon-button-size: var(--yvz-dial-button-size, 44px);
      }
    `,
  ];

  private fraction(v: number): number {
    const span = this.max - this.min || 1;
    return Math.min(1, Math.max(0, (v - this.min) / span));
  }

  protected override firstUpdated(): void {
    requestAnimationFrame(() => (this.ready = true));
  }

  protected override render() {
    const fill = this.value == null || Number.isNaN(this.value) || !this.ready ? 0 : this.fraction(this.value) * 100;
    const knob = this.target == null || Number.isNaN(this.target) ? undefined : this.fraction(this.target) * SWEEP;
    if (knob != null && this.ready) this.lastKnob = knob;
    // The fill path always exists so the sweep can animate; a zero-length dash would still show a round cap.
    return html`
      <div class="ambient"></div>
      <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">
        <path class="track" d=${ARC}></path>
        <path
          class="fill"
          d=${ARC}
          pathLength="100"
          style="stroke-dasharray: ${fill} 100; opacity: ${fill > 0.5 ? 1 : 0}"
        ></path>
        <g class="knob" style="transform: rotate(${this.lastKnob}deg); opacity: ${knob == null ? 0 : 1}">
          <circle cx=${SX} cy=${SY} r="7"></circle>
        </g>
      </svg>
      <div class="center"><slot></slot></div>
      <div class="cap" style=${START_SLOT}><slot name="start"></slot></div>
      <div class="cap" style=${END_SLOT}><slot name="end"></slot></div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "yvz-dial": YvzDial;
  }
}
