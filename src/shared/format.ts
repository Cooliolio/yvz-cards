import type { Translator } from "./i18n";
import type { HomeAssistant } from "./types";

function locale(hass: HomeAssistant): string {
  return hass.locale?.language ?? hass.language;
}

export function formatNumber(hass: HomeAssistant, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale(hass), options).format(value);
}

export function formatTime(hass: HomeAssistant, date: Date | number | string): string {
  const { time_format: format, time_zone: zone } = hass.locale ?? {};
  return new Intl.DateTimeFormat(locale(hass), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: format === "12" ? true : format === "24" ? false : undefined,
    timeZone: zone === "server" ? hass.config.time_zone : undefined,
  }).format(new Date(date));
}

export function formatDuration(t: Translator, ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 60) return t("common.minutes_short", { count: minutes });
  return `${t("common.hours_short", { count: Math.floor(minutes / 60) })} ${t("common.minutes_short", { count: minutes % 60 })}`;
}
