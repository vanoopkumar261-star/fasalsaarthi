import { DEFAULT_LOCALE, type Locale } from "./config";
import { BASE } from "./base";
import { DASHBOARD } from "./dashboard";
import { MOBILE } from "./mobile";

type Dict = Record<string, string>;

/** Later sources win, so a mobile-specific string can override a shared one. */
const DICTIONARIES = Object.fromEntries(
  (Object.keys(BASE) as Locale[]).map((l) => [l, { ...BASE[l], ...DASHBOARD[l], ...MOBILE[l] }]),
) as Record<Locale, Dict>;

function interpolate(s: string, params?: Record<string, string | number>) {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}

/**
 * key → this locale → English → the key itself. Falling back to the key rather
 * than to empty makes a missing translation visible in review instead of
 * silently blanking a button.
 */
export function translate(locale: Locale, key: string, params?: Record<string, string | number>) {
  const hit = DICTIONARIES[locale]?.[key] ?? DICTIONARIES[DEFAULT_LOCALE]?.[key] ?? key;
  return interpolate(hit, params);
}

export { DEFAULT_LOCALE, type Locale };
export { LOCALES } from "./config";
