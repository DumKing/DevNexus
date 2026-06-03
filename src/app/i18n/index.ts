import { useSettingsStore } from "@/app/store/settings";
import { translations, type AppLanguage } from "@/app/i18n/translations";
import { useCallback } from "react";

export type TranslateFn = (key: string, params?: Record<string, string | number | undefined>) => string;

export function translate(language: AppLanguage, key: string, params: Record<string, string | number | undefined> = {}): string {
  const template = translations[language][key] ?? translations["en-US"][key] ?? key;
  return Object.entries(params).reduce((text, [name, value]) => text.replace(new RegExp(`\\{${name}\\}`, "g"), value == null ? "" : String(value)), template);
}

export function useI18n(): { language: AppLanguage; t: TranslateFn } {
  const language = useSettingsStore((state) => state.language);
  const t = useCallback<TranslateFn>((key, params) => translate(language, key, params), [language]);
  return {
    language,
    t,
  };
}

export function pluginLabel(language: AppLanguage, id: string, fallback: string): string {
  return translations[language][`plugin.${id}`] ?? translations["en-US"][`plugin.${id}`] ?? fallback;
}
