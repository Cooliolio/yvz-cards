import { css, nothing, svg, type TemplateResult } from "lit";

export interface CarState {
  rgb: [number, number, number];
  frunk: boolean;
  trunk: boolean;
  doorOpen: boolean;
  windowOpen: boolean;
  portOpen: boolean;
  plugged: boolean;
  charging: boolean;
  sentry: boolean;
  flashing: boolean;
  driving: boolean;
  asleep: boolean;
  defrost: boolean;
  climate: boolean;
  speed: number | null;
}

type Rgb = [number, number, number];

function mix(rgb: Rgb, target: Rgb, amount: number): string {
  const c = rgb.map((v, i) => Math.round(v + (target[i] - v) * amount));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function luminance([r, g, b]: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [70, 74, 79];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const BLADES = [0, 72, 144, 216, 288];

const wheel = (x: number): TemplateResult => svg`
  <g class="wheel" transform="translate(${x} 50.6)">
    <circle r="15.4" class="tire" />
    <circle r="11.5" fill="#1b1d20" />
    <circle r="11" fill="none" stroke="#2c2f33" stroke-width="0.6" />
    <g class="spinner">
      <circle r="11" fill="none" />
      <g fill="#3a3d42" stroke="#46494f" stroke-width="0.25">
        ${BLADES.map((r) => svg`<use href="#tesla-blade" transform="rotate(${r})" />`)}
      </g>
      <circle r="2.6" fill="#2c2f33" stroke="#46494f" stroke-width="0.25" />
    </g>
  </g>`;

// Side view of the car in the chosen paint, with lids, doors, cable and lights following its state.
export function renderCar(s: CarState): TemplateResult {
  const mid = `rgb(${s.rgb.join(",")})`;
  const hi = mix(s.rgb, [255, 255, 255], 0.28);
  const lo = mix(s.rgb, [0, 0, 0], 0.4);
  const lidHi = mix(s.rgb, [0, 0, 0], 0.12);
  const lidLo = mix(s.rgb, [0, 0, 0], 0.5);
  const outline = luminance(s.rgb) < 0.35 ? "rgba(255,255,255,0.26)" : "rgba(0,0,0,0.2)";
  const spin = s.speed ? Math.max(0.35, Math.min(1.6, 1.6 - s.speed / 90)) : 0.8;

  return svg`
    <svg class="car ${s.driving ? "driving" : ""}" style="--spin: ${spin.toFixed(2)}s" viewBox="0 0 240 78" aria-hidden="true">
      <defs>
        <linearGradient id="paint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color=${hi} />
          <stop offset="0.42" stop-color=${mid} />
          <stop offset="1" stop-color=${lo} />
        </linearGradient>
        <linearGradient id="paint-lid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color=${lidHi} />
          <stop offset="1" stop-color=${lidLo} />
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#34404f" />
          <stop offset="1" stop-color="#0f141a" />
        </linearGradient>
        <radialGradient id="beam" cx="0" cy="0.5" r="1">
          <stop offset="0" stop-color="rgba(255,250,220,0.85)" />
          <stop offset="1" stop-color="rgba(255,250,220,0)" />
        </radialGradient>
        <path id="tesla-glass" d="M86.6 23.7 C91.6 18.8 98 13.4 105.2 10.3 C115 7.3 125 6.5 135 6.3 C150 6.2 163 7.7 174 10.4 C180 12 185 14.4 188.6 17.4 C187.8 19.1 185.9 20.4 183.2 20.9 C160 21.5 120 23.1 88.8 24.5 Z" />
        <path id="tesla-blade" d="M0 -3.4 L0.45 -4.58 L1.14 -5.69 L2.05 -6.69 L3.16 -7.57 L4.46 -8.27 L5.93 -8.79 A10.6 10.6 0 0 1 10.47 -1.68 L9.12 -2.26 L7.77 -2.63 L6.42 -2.8 L5.1 -2.76 L3.85 -2.52 L2.68 -2.09 A3.4 3.4 0 0 0 0 -3.4 Z" />
      </defs>

      <ellipse cx="120" cy="66.4" rx="104" ry="3.6" class="shadow" />
      ${s.driving
        ? svg`<g class="wind"><path d="M150 -1 L176 -1" /><path d="M222 16 L240 16" /><path d="M224 33 L244 33" /><path d="M221 47 L236 47" /></g>`
        : nothing}
      ${s.flashing ? svg`<path class="beam" d="M21 39 L-30 26 L-30 58 Z" fill="url(#beam)" />` : nothing}

      ${s.frunk
        ? svg`<path class="lid frunk" fill="url(#paint-lid)" stroke=${outline} stroke-width="0.4" d="M78 24.4 L24 4.2 C22.8 3.8 22 5.4 23 6.4 L74 30 Z" />`
        : nothing}
      ${s.trunk
        ? svg`<path class="lid trunk" fill="url(#paint-lid)" stroke=${outline} stroke-width="0.4" d="M201 21.1 L217.8 7.3 C218.8 6.7 220 7.7 219.4 8.7 L206 24.4 Z" />`
        : nothing}

      ${wheel(52.7)} ${wheel(183.5)}

      <path fill="url(#paint)" stroke=${outline} stroke-width="0.4" stroke-linejoin="round"
        d="M213 57.2 C213.9 56.6 217.5 55.4 218.6 53.6 C219.7 51.8 219.6 48.9 219.6 46.4 C219.6 43.9 219.1 41.1 218.6 38.4 C218.1 35.8 217.1 33.6 216.6 32.2 C216.1 30.7 215.8 29.5 215.8 27.7 C215.9 25.9 216.7 23.5 216.9 22.7 C215.6 22.4 212.8 22.1 209 21 C205.2 19.8 199.2 17 194.3 15 C189.4 13 184.5 11 179.6 9.3 C174.7 7.7 169.8 6.2 164.9 5.2 C160 4.3 155.1 3.8 150.2 3.4 C145.3 3.1 140.4 3 135.5 3.2 C130.6 3.4 125.7 3.7 120.8 4.5 C115.9 5.3 109.8 6.7 106.1 7.8 C102.4 8.9 101.2 9.7 98.8 10.9 C96.3 12.1 93.9 13.6 91.4 14.9 C89 16.2 86.5 17.6 84.1 19 C81.7 20.4 78.2 22.6 77 23.3 C74.5 23.6 67 24.7 62.1 25.4 C57.2 26.1 51.8 26.5 47.4 27.4 C43 28.3 39.1 29.7 35.6 31 C32.1 32.3 28.9 34 26.4 35.4 C23.9 36.8 21.4 38.9 20.4 39.6 C20.5 40.6 20.6 43.6 20.9 45.4 C21.1 47.2 22.2 48.9 21.9 50.4 C21.6 51.9 19.7 53.7 19.3 54.4 C19.5 54.6 19.6 55.1 20.6 55.6 C21.6 56.1 24.7 57.3 25.5 57.6 L36.6 57.6 A17.6 17.6 0 1 1 68.8 57.6 L69.6 59.6 L166.6 59.6 L167.4 57.6 A17.6 17.6 0 1 1 199.6 57.6 Z" />

      <path class="trim" d="M68.8 57.6 L69.6 59.6 L166.6 59.6 L167.4 57.6 L167 55.9 C130 55.3 100 55.3 70.2 55.9 Z" />
      <path class="trim" d="M25.5 57.6 L36.6 57.6 L36.3 55.6 C30 55.4 24.6 55.1 21.2 55.3 C21.6 56.2 23.6 57.1 25.5 57.6 Z" />
      <path class="trim" d="M199.6 57.6 L213 57.2 C214.6 56.6 216.4 55.6 217.4 54.8 C210 55.2 204 55.5 200.4 55.7 Z" />
      <path class="shoulder" d="M34 33.4 C70 29.6 140 26.3 214.6 26.7" />
      <path class="crease" d="M73 50.4 C110 49.4 140 49.3 165.6 49.7" />

      ${s.windowOpen ? svg`<use href="#tesla-glass" fill="#06080b" />` : nothing}
      <use class="glass ${s.windowOpen ? "open" : ""}" href="#tesla-glass" fill="url(#glass)" stroke="#0b0d10" stroke-width="0.7" stroke-linejoin="round" />
      ${s.defrost
        ? svg`<g class="steam"><path d="M92 21 c1.5 -2 -1.5 -4 0 -6" /><path d="M97 17.5 c1.5 -2 -1.5 -4 0 -6" /><path d="M102 14 c1.5 -2 -1.5 -4 0 -6" /><path d="M177 17 c1.5 -2 -1.5 -4 0 -6" /><path d="M181 16.5 c1.5 -2 -1.5 -4 0 -6" /><path d="M185 16 c1.5 -2 -1.5 -4 0 -6" /></g>`
        : nothing}
      ${s.climate
        ? svg`<use class="cabin-glow" href="#tesla-glass" />
            <g class="heat"><path d="M112 0 c2.5 -3 -2.5 -6 0 -9" /><path d="M135 -1 c2.5 -3 -2.5 -6 0 -9" /><path d="M158 1 c2.5 -3 -2.5 -6 0 -9" /></g>`
        : nothing}
      ${s.windowOpen
        ? svg`<path class="window-line" d="M91 20.6 C99 14 110 10 129 9 M138.5 8.8 C152 8.8 165 10 177 13.4" />`
        : nothing}
      <path d="M132.4 6.4 L136.6 6.4 L133.9 23.1 L129.7 23.3 Z" fill="#0b0d10" />
      <path d="M171.6 9.7 L173.5 21.2" stroke="#0b0d10" stroke-width="1.1" />

      <path class="seam ${s.doorOpen ? "open" : ""}" d="M85.4 24.9 C81.8 30.2 80.3 38 80.7 46 L81.1 55.8 M131.7 23.4 L131.5 55.6 M178.9 21.6 C179.6 28.9 177 35.7 170.6 40.4" />
      <rect x="118" y="27.6" width="7" height="1.3" rx="0.65" class="handle" />
      <rect x="163.4" y="26.6" width="6.5" height="1.3" rx="0.65" class="handle" />
      <path fill="url(#paint)" stroke=${outline} stroke-width="0.4" d="M86 23.6 C87.6 20.6 92.4 19.8 95 20.8 C95.6 22 95.2 23.4 94.2 23.9 C91.4 24.3 88.4 24.4 86 23.6 Z" />

      <path class="headlight ${s.flashing ? "on" : ""}" d="M21.2 39.4 C25 36.8 30 34.8 36.4 33.4 L36.8 34.6 C31 35.8 26 37.8 22 40.6 Z" />
      <path class="taillight ${s.flashing ? "on" : ""}" d="M204.6 24.1 C209.2 24.9 213.4 25.6 216.7 26.2 L216.3 28.7 C212.8 28.1 208.8 27.3 205.2 26.4 Z" />

      <rect x="207.8" y="29.5" width="5" height="3.6" rx="1.1" class="port-door ${s.plugged ? "lit" : ""} ${s.charging ? "pulse" : ""}" />
      ${s.portOpen || s.plugged ? svg`<rect x="212.9" y="28.9" width="1.8" height="4.8" rx="0.8" class="port-flap" />` : nothing}
      ${s.plugged
        ? svg`<path class="cable" d="M210.3 31.5 C216 38 222 56 244 66" />${s.charging ? svg`<path class="cable-flow" d="M210.3 31.5 C216 38 222 56 244 66" />` : nothing}<rect x="208.6" y="30.2" width="3.4" height="2.4" rx="0.7" class="plug" />`
        : nothing}

      ${s.asleep
        ? svg`<g class="zzz"><text x="128" y="10">z</text><text x="136" y="5">z</text><text x="144" y="0">Z</text></g>`
        : nothing}

      ${s.sentry
        ? svg`<circle class="sentry" cx="132.7" cy="15.6" r="1.4" /><circle class="sentry ring" cx="132.7" cy="15.6" r="1.4" />`
        : nothing}
    </svg>`;
}

export const carStyles = css`
  .car {
    display: block;
    width: 100%;
    height: auto;
    max-height: var(--tesla-car-height, 96px);
    overflow: visible;
  }

  .car .shadow {
    fill: rgba(0, 0, 0, 0.38);
  }

  /* an open window slides down: the pane is clipped from the top and the dark cabin shows above it */
  .car .glass {
    clip-path: inset(0 0 0 0) fill-box;
    transition: clip-path 0.6s ease-in-out;
  }

  .car .glass.open {
    clip-path: inset(40% 0 0 0) fill-box;
  }

  .car .steam path {
    fill: none;
    stroke: var(--yvz-standby);
    stroke-width: 0.8;
    stroke-linecap: round;
    opacity: 0;
    animation: heat-rise 2s ease-out infinite;
  }

  .car .steam path:nth-child(2n) {
    animation-delay: 0.6s;
  }

  .car .steam path:nth-child(3n) {
    animation-delay: 1.2s;
  }

  .car .window-line {
    fill: none;
    stroke: var(--yvz-pending);
    stroke-width: 1;
    stroke-dasharray: 2 2;
  }

  .car .shoulder {
    fill: none;
    stroke: rgba(255, 255, 255, 0.14);
    stroke-width: 0.5;
  }

  .car .seam {
    fill: none;
    stroke: rgba(0, 0, 0, 0.6);
    stroke-width: 0.55;
  }

  .car .seam.open {
    stroke: var(--yvz-pending);
    stroke-width: 1.1;
  }

  .car .trim {
    fill: #1a1b1e;
  }

  .car .crease {
    fill: none;
    stroke: rgba(0, 0, 0, 0.3);
    stroke-width: 0.5;
  }

  .car .handle {
    fill: #16181b;
  }

  /* lids swing open from their hinge at the windscreen / rear window */
  .car .lid {
    transform-box: view-box;
    animation: lid-open 0.5s ease-out;
  }

  .car .lid.frunk {
    transform-origin: 76px 27px;
    --lid-from: -22deg;
  }

  .car .lid.trunk {
    transform-origin: 204px 23px;
    --lid-from: 22deg;
  }

  .car .cable-flow {
    fill: none;
    stroke: var(--yvz-on);
    stroke-width: 0.9;
    stroke-linecap: round;
    stroke-dasharray: 2 5;
    filter: drop-shadow(0 0 1.5px var(--yvz-on));
    animation: cable-flow 0.9s linear infinite;
  }

  /* climate on: the cabin warms up and heat rises off the roof */
  .car .cabin-glow {
    fill: var(--yvz-heat);
    animation: cabin-glow 2.4s ease-in-out infinite;
    pointer-events: none;
  }

  .car .heat path {
    fill: none;
    stroke: var(--yvz-heat);
    stroke-width: 0.9;
    stroke-linecap: round;
    opacity: 0;
    animation: heat-rise 2.4s ease-out infinite;
  }

  .car .heat path:nth-child(2) {
    animation-delay: 0.8s;
  }

  .car .heat path:nth-child(3) {
    animation-delay: 1.6s;
  }

  .car .zzz text {
    fill: var(--yvz-text-muted);
    font-size: 7px;
    font-weight: 600;
    opacity: 0;
    animation: float-z 3s ease-in-out infinite;
  }

  .car .zzz text:nth-child(2) {
    animation-delay: 0.7s;
  }

  .car .zzz text:nth-child(3) {
    animation-delay: 1.4s;
  }

  .car .headlight {
    fill: #eef3f8;
    opacity: 0.92;
  }

  .car .headlight.on {
    fill: #fffbe0;
    filter: drop-shadow(0 0 3px #fff6c0);
    animation: blink 0.45s ease-in-out 4;
  }

  .car .beam {
    animation: blink 0.45s ease-in-out 4;
  }

  .car .taillight {
    fill: #c62828;
  }

  .car .taillight.on {
    filter: drop-shadow(0 0 3px #ff4a4a);
    animation: blink 0.45s ease-in-out 4;
  }

  .car .port-door {
    fill: rgba(0, 0, 0, 0.22);
    stroke: rgba(255, 255, 255, 0.22);
    stroke-width: 0.45;
  }

  .car .port-door.lit {
    fill: var(--yvz-on);
    filter: drop-shadow(0 0 3px var(--yvz-on));
  }

  .car .port-door.pulse {
    animation: pulse 1.6s ease-in-out infinite;
  }

  .car .port-flap {
    fill: #4a4d52;
  }

  .car .cable {
    fill: none;
    stroke: #141518;
    stroke-width: 2.1;
    stroke-linecap: round;
  }

  .car .plug {
    fill: #2a2e33;
  }

  .car .sentry {
    fill: #ff2d2d;
  }

  .car .sentry.ring {
    fill: none;
    stroke: #ff2d2d;
    stroke-width: 0.8;
    transform-box: fill-box;
    transform-origin: center;
    animation: ring 1.8s ease-out infinite;
  }

  .car .tire {
    fill: #111214;
  }

  /* each wheel group is translated to its centre, so spinning around the local origin is spinning around the hub */
  .car .spinner {
    transform-box: view-box;
    transform-origin: 0 0;
  }

  .car.driving .spinner {
    animation: spin-back var(--spin, 0.8s) linear infinite;
  }

  .car .wind path {
    fill: none;
    stroke: rgba(255, 255, 255, 0.4);
    stroke-width: 0.9;
    stroke-linecap: round;
    opacity: 0;
    animation: wind 1.1s linear infinite;
  }

  .car .wind path:nth-child(2) {
    animation-delay: 0.3s;
  }

  .car .wind path:nth-child(3) {
    animation-delay: 0.55s;
  }

  .car .wind path:nth-child(4) {
    animation-delay: 0.8s;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }

  @keyframes blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.15;
    }
  }

  @keyframes ring {
    from {
      transform: scale(1);
      opacity: 0.9;
    }
    to {
      transform: scale(3.2);
      opacity: 0;
    }
  }

  @keyframes wind {
    0% {
      transform: translateX(-12px);
      opacity: 0;
    }
    30% {
      opacity: 1;
    }
    100% {
      transform: translateX(16px);
      opacity: 0;
    }
  }

  @keyframes cabin-glow {
    0%,
    100% {
      opacity: 0.08;
    }
    50% {
      opacity: 0.32;
    }
  }

  @keyframes heat-rise {
    0% {
      opacity: 0;
      transform: translateY(4px);
    }
    30% {
      opacity: 0.8;
    }
    100% {
      opacity: 0;
      transform: translateY(-6px);
    }
  }

  @keyframes lid-open {
    from {
      transform: rotate(var(--lid-from));
      opacity: 0.4;
    }
  }

  /* dashes travel along the cable towards the car */
  @keyframes cable-flow {
    to {
      stroke-dashoffset: 14;
    }
  }

  @keyframes float-z {
    0% {
      opacity: 0;
      transform: translateY(4px);
    }
    40% {
      opacity: 0.9;
    }
    100% {
      opacity: 0;
      transform: translateY(-6px);
    }
  }

  @keyframes spin-back {
    to {
      transform: rotate(-360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .car * {
      animation: none !important;
      transition: none !important;
    }
  }
`;
