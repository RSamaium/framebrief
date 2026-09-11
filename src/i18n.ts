import type { UiLanguage } from "./prompt-aids";
export const language: UiLanguage = typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
export const tr = (en: string, fr: string) => language === "fr" ? fr : en;
if (typeof document !== "undefined") {
  document.documentElement.lang = language;
  document.title = tr("Framebrief — visual video instructions", "Framebrief — annotations vidéo");
}
