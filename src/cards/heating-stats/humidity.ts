import type { HomeAssistant } from "../../shared/types";

// The humidity of a room: the humidity sensor on the same device as its temperature sensor, else the entity
// named like it. Anyone can read the entity registry that hass carries; nothing else is asked for.
export function humidityOf(hass: Pick<HomeAssistant, "states" | "entities">, temperatureEntity: string): number | undefined {
  const device = hass.entities?.[temperatureEntity]?.device_id;
  let id: string | undefined;
  if (device) {
    id = Object.values(hass.entities ?? {}).find(
      (e) => e.device_id === device && e.entity_id.startsWith("sensor.") && hass.states[e.entity_id]?.attributes.device_class === "humidity",
    )?.entity_id;
  }
  if (!id && temperatureEntity.endsWith("_temperature")) id = temperatureEntity.replace(/_temperature$/, "_humidity");
  const value = id ? parseFloat(hass.states[id]?.state ?? "") : NaN;
  return Number.isNaN(value) ? undefined : value;
}
