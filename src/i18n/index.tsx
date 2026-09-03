import { useSyncExternalStore, useMemo } from "react";
import { dateFormat, isLanguage, moneyFormat, numberFormat, storageKey, translate, type Language, type Params } from "./core";
export { languages } from "./core";

function readPreference(): Language {
  try { const value = localStorage.getItem(storageKey); return isLanguage(value) ? value : "pt-BR"; }
  catch { return "pt-BR"; }
}
let language: Language = typeof window === "undefined" ? "pt-BR" : readPreference();
const listeners = new Set<() => void>();
function notify(next: Language) {
  language = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  listeners.forEach(listener => listener());
}
if (typeof window !== "undefined") {
  document.documentElement.lang = language;
  window.addEventListener("storage", event => {
    if (event.key === storageKey || event.key === null) notify(readPreference());
  });
}
export function setLanguage(next: Language) {
  if (!isLanguage(next)) return;
  try { localStorage.setItem(storageKey, next); } catch { /* Keep the selection in memory when storage is blocked. */ }
  notify(next);
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useI18n() {
  const current = useSyncExternalStore(subscribe, () => language, () => "pt-BR" as Language);
  return useMemo(() => ({
    language: current, setLanguage,
    t: (source: string, params?: Params) => translate(current, source, params),
    number: (value: number, options?: Intl.NumberFormatOptions) => numberFormat(current, value, options),
    money: (value: number, currency?: string) => moneyFormat(current, value, currency),
    date: (value: Date | string, options?: Intl.DateTimeFormatOptions) => dateFormat(current, value, options),
  }), [current]);
}
// Safe React text rendering, including dialogs rendered through portals.
export function T({ children, values }: { children: string; values?: Params }) {
  const { t } = useI18n();
  return <>{t(children, values)}</>;
}
