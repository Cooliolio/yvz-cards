export function fireMoreInfo(from: HTMLElement, entityId: string | undefined): void {
  if (!entityId) return;
  from.dispatchEvent(
    new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId } }),
  );
}
