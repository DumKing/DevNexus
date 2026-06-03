import { useI18n, translate, type TranslateFn } from "@/app/i18n";
import type { AppLanguage } from "@/app/i18n/translations";

export type PluginTranslations = Record<AppLanguage, Record<string, string>>;

export function translatePlugin(
  language: AppLanguage,
  translations: PluginTranslations,
  key: string,
  params: Record<string, string | number | undefined> = {},
): string {
  const template = translations[language][key] ?? translations["en-US"][key] ?? key;
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replace(new RegExp(`\\{${name}\\}`, "g"), value == null ? "" : String(value)),
    template,
  );
}

export function usePluginI18n(translations: PluginTranslations): {
  language: AppLanguage;
  t: TranslateFn;
  appT: TranslateFn;
} {
  const { language, t: appT } = useI18n();
  return {
    language,
    appT,
    t: (key, params) => translatePlugin(language, translations, key, params),
  };
}

export { translate };
