import { css } from "lit";
import { reducedMotion } from "./tween";

// Eases a card between two heights, e.g. when it swaps between its main and settings view.
export function animateHeight(card: HTMLElement | null | undefined, from: number): void {
  const to = card?.offsetHeight ?? 0;
  if (!card || from === to || reducedMotion()) return;
  card.animate(
    [
      { height: `${from}px`, overflow: "hidden" },
      { height: `${to}px`, overflow: "hidden" },
    ],
    { duration: 300, easing: "ease-out" },
  );
}

// Slides the new view in from the side it "lives" on. Put the classes on the view's container.
export const viewSwapStyles = css`
  @keyframes from-end {
    from {
      opacity: 0;
      transform: translateX(16px);
    }
  }

  @keyframes from-start {
    from {
      opacity: 0;
      transform: translateX(-16px);
    }
  }

  .view.from-end > * {
    animation: from-end var(--yvz-duration-slow) var(--yvz-ease);
  }

  .view.from-start > * {
    animation: from-start var(--yvz-duration-slow) var(--yvz-ease);
  }
`;
