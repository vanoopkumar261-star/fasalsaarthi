export const LOCALES = [
  { code: "en", label: "English", aiName: "English" },
  { code: "hi", label: "हिन्दी", aiName: "Hindi" },
  { code: "kn", label: "ಕನ್ನಡ", aiName: "Kannada" },
  { code: "ta", label: "தமிழ்", aiName: "Tamil" },
  { code: "te", label: "తెలుగు", aiName: "Telugu" },
  { code: "ml", label: "മലയാളം", aiName: "Malayalam" },
  { code: "mr", label: "मराठी", aiName: "Marathi" },
  { code: "bn", label: "বাংলা", aiName: "Bengali" },
  { code: "pa", label: "ਪੰਜਾਬੀ", aiName: "Punjabi" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "en";
export const STORAGE_KEY = "af_locale";

export function aiLanguageName(code: string): string {
  return LOCALES.find((l) => l.code === code)?.aiName ?? "English";
}
