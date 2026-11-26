"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Languages } from "lucide-react";
import "@/app/productivity.css";

export type Locale = "en" | "ur";
type LocaleState = { locale: Locale; setLocale: (locale: Locale) => void; t: (english: string, urdu: string) => string };
const LocaleContext = createContext<LocaleState>({ locale: "en", setLocale: () => {}, t: english => english });
const preferenceKey = "hisabivo.locale.v1";

/** Mount around the workspace, so public pages keep their own document direction. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setCurrent] = useState<Locale>("en");
  useEffect(() => { try { if (localStorage.getItem(preferenceKey) === "ur") setCurrent("ur"); } catch { /* The current visit still works without storage. */ } }, []);
  function setLocale(next: Locale) {
    if (next !== "en" && next !== "ur") return;
    setCurrent(next);
    try { localStorage.setItem(preferenceKey, next); } catch { /* A private-browser preference can stay in memory. */ }
  }
  return <LocaleContext.Provider value={{ locale, setLocale, t: (english, urdu) => locale === "ur" ? urdu : english }}><div className="hisabivo-locale" lang={locale} dir={locale === "ur" ? "rtl" : "ltr"} data-locale={locale}>{children}</div></LocaleContext.Provider>;
}
export function useLocale() { return useContext(LocaleContext); }
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLocale();
  return <div className={`prod-language${compact ? " is-compact" : ""}`}><Languages size={17} aria-hidden="true" /><label><span className="sr-only">{t("Workspace language", "ورک اسپیس کی زبان")}</span><select aria-label={t("Workspace language", "ورک اسپیس کی زبان")} value={locale} onChange={event => setLocale(event.target.value as Locale)}><option value="en">English</option><option value="ur">اردو</option></select></label></div>;
}
