import type { ButtonStatus } from "../design";
import type { HomeAssistant } from "./types";

interface HasStatus {
  status: ButtonStatus;
}

// Shows success/error on a control briefly after an async action settles.
export async function runAction(el: HasStatus, action: () => Promise<unknown>, resetMs = 900): Promise<void> {
  try {
    await action();
    el.status = "success";
  } catch {
    el.status = "error";
  }
  setTimeout(() => {
    el.status = "idle";
  }, resetMs);
}

// Fires whatever "pressable" entity the user picked: script, scene, button or a toggle.
export function triggerEntity(hass: HomeAssistant, entityId: string): Promise<unknown> {
  const domain = entityId.split(".")[0];
  const data = { entity_id: entityId };
  switch (domain) {
    case "script":
    case "scene":
      return hass.callService(domain, "turn_on", data);
    case "button":
    case "input_button":
      return hass.callService(domain, "press", data);
    default:
      return hass.callService("homeassistant", "toggle", data);
  }
}
