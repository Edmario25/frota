import { Globe } from "lucide-react";
import { languages, useI18n } from "@/i18n";
import { isLanguage } from "@/i18n/core";

export function LanguageSelector({ className = "" }: { className?: string }) {
  const { language, setLanguage, t } = useI18n();
  return <label className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-foreground ${className}`}>
    <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
    <span className="sr-only">{t("Idioma")}</span>
    <select aria-label={t("Idioma")} value={language} onChange={event => {
      if (isLanguage(event.target.value)) setLanguage(event.target.value);
    }} className="max-w-24 bg-transparent py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {Object.entries(languages).map(([code, label]) => <option key={code} value={code} lang={code}>{label}</option>)}
    </select>
  </label>;
}
