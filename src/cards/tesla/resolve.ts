import type { HomeAssistant } from "../../shared/types";
import { TESLA_ENTITIES, TESLA_PLATFORMS, type TeslaCardConfig, type TeslaEntityKey } from "./types";

const domainOf = (entityId: string): string => entityId.split(".")[0];

export function findTeslaDevice(hass: Pick<HomeAssistant, "entities"> | undefined): string | undefined {
  return Object.values(hass?.entities ?? {}).find(
    (e) => e.device_id && TESLA_PLATFORMS.includes(e.platform) && e.translation_key === "charge_state_battery_level",
  )?.device_id ?? undefined;
}

export interface ResolvedEntities {
  entities: Partial<Record<TeslaEntityKey, string>>;
  deviceId?: string;
}

// Matches each card key to an entity of the chosen car by domain + translation_key.
export function resolveEntities(config: TeslaCardConfig, hass: HomeAssistant): ResolvedEntities {
  const deviceId = config.device_id || (!config.prefix ? findTeslaDevice(hass) : undefined);
  const candidates = Object.values(hass.entities ?? {}).filter((e) =>
    deviceId ? e.device_id === deviceId : TESLA_PLATFORMS.includes(e.platform),
  );
  const entities: ResolvedEntities["entities"] = {};
  for (const key of Object.keys(TESLA_ENTITIES) as TeslaEntityKey[]) {
    const { domain, translationKey, legacy } = TESLA_ENTITIES[key];
    const override = config.entities?.[key];
    if (override) {
      entities[key] = override;
      continue;
    }
    let hit = candidates.find((e) => domainOf(e.entity_id) === domain && e.translation_key === translationKey);
    // The climate entity's translation_key differs between integrations; take the car's main one.
    if (!hit && key === "climate") {
      hit = candidates.find(
        (e) => domainOf(e.entity_id) === "climate" && !String(e.translation_key ?? "").includes("cabin_overheat"),
      );
    }
    if (hit) entities[key] = hit.entity_id;
    else if (config.prefix) entities[key] = legacy.replace("{p}", config.prefix);
  }
  return { entities, deviceId };
}
