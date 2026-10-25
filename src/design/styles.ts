import { css } from "lit";
import { paletteStyles } from "./palette";
import { injectScaleTokens } from "./scale";

injectScaleTokens();

const baseStyles = css`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  :focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
`;

export const designStyles = [paletteStyles, baseStyles];
