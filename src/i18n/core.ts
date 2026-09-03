import { catalog } from "./catalog";

export const languages = { "pt-BR": "Português", en: "English", es: "Español" } as const;
export type Language = keyof typeof languages;
export type Params = Record<string, string | number>;
export const storageKey = "apice-language";
export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(languages, value);
}
export function translate(language: Language, source: string, params: Params = {}): string {
  const entry = Object.prototype.hasOwnProperty.call(catalog, source) ? catalog[source] : undefined;
  const text = language === "pt-BR" || !entry ? source : entry[language === "en" ? 0 : 1];
  return text.replace(/\{(\w+)\}/g, (token, key: string) => Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : token);
}
export function numberFormat(language: Language, value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(language, options).format(value);
}
// Language changes formatting only; it never changes or converts the currency.
export function moneyFormat(language: Language, value: number, currency = "BRL") {
  return numberFormat(language, value, { style: "currency", currency });
}
export function dateFormat(language: Language, value: Date | string, options?: Intl.DateTimeFormatOptions) {
  // Parse date-only values locally to avoid displaying the previous day in Brazil.
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(Number(value.slice(0,4)), Number(value.slice(5,7))-1, Number(value.slice(8,10)))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(language, options).format(date);
}
