import en from "../locales/en";
import nl from "../locales/nl";
import tr from "../locales/tr";
import type { HomeAssistant } from "./types";

const dictionaries = { en, nl, tr };

export type Language = keyof typeof dictionaries;
export type TranslationKey = keyof typeof en;
export type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;

const FALLBACK: Language = "en";
const cache = new Map<Language, Translator>();

export function resolveLanguage(hass?: Pick<HomeAssistant, "language" | "locale">): Language {
  const code = (hass?.locale?.language ?? hass?.language ?? FALLBACK).toLowerCase().split("-")[0];
  return code in dictionaries ? (code as Language) : FALLBACK;
}

export function createTranslator(hass?: Pick<HomeAssistant, "language" | "locale">): Translator {
  const lang = resolveLanguage(hass);
  let t = cache.get(lang);
  if (!t) {
    const dict = dictionaries[lang];
    t = (key, params) => {
      const text = dict[key] ?? en[key] ?? key;
      return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => String(params[k] ?? m)) : text;
    };
    cache.set(lang, t);
  }
  return t;
}
