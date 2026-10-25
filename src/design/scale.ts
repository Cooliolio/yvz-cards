const STYLE_ID = "yvz-design-tokens";

const CSS_TEXT = `
:root {
  --yvz-space-1: 4px;
  --yvz-space-2: 8px;
  --yvz-space-3: 12px;
  --yvz-space-4: 16px;
  --yvz-space-5: 20px;
  --yvz-space-6: 24px;

  --yvz-radius-sm: 8px;
  --yvz-radius-md: 12px;
  --yvz-radius-lg: var(--ha-card-border-radius, 12px);
  --yvz-radius-pill: 999px;

  --yvz-text-caption: 11px;
  --yvz-line-caption: 16px;
  --yvz-text-label: 12px;
  --yvz-line-label: 16px;
  --yvz-text-body: 14px;
  --yvz-line-body: 20px;
  --yvz-text-title: 16px;
  --yvz-line-title: 24px;
  --yvz-text-value: 20px;
  --yvz-line-value: 28px;
  --yvz-text-big: 28px;
  --yvz-line-big: 36px;
  --yvz-text-display: 44px;
  --yvz-line-display: 52px;

  --yvz-weight-regular: 400;
  --yvz-weight-medium: 500;
  --yvz-weight-strong: 600;

  --yvz-duration-fast: 120ms;
  --yvz-duration-base: 200ms;
  --yvz-duration-slow: 400ms;
  --yvz-ease: ease-out;
  /* how far anything tappable shrinks while pressed */
  --yvz-press-scale: 0.96;

  --yvz-surface: var(--ha-card-background, var(--card-background-color));
  --yvz-surface-raised: var(--secondary-background-color);
  --yvz-divider: var(--divider-color);
  --yvz-text: var(--primary-text-color);
  --yvz-text-muted: var(--secondary-text-color);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --yvz-duration-fast: 0ms;
    --yvz-duration-base: 0ms;
    --yvz-duration-slow: 0ms;
  }
}
`;

// Plain scale tokens live on :root so overrides on a card reach nested shadow roots.
export function injectScaleTokens(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS_TEXT;
  document.head.appendChild(style);
}
