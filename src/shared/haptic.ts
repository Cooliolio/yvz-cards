export type HapticType = "success" | "warning" | "failure" | "light" | "medium" | "heavy" | "selection";

// The HA frontend forwards this window event to the companion app's vibration motor.
export function haptic(type: HapticType = "light"): void {
  window.dispatchEvent(new CustomEvent("haptic", { detail: type }));
}
