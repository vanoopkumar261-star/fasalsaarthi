import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !anonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — check mobile/.env.local"
  );
}

/**
 * Guards AsyncStorage behind a `window` check. Expo Router's web target
 * (app.json: web.output "static") pre-renders routes in a Node SSR pass with
 * no `window` — calling into AsyncStorage's web/localStorage backend there
 * throws "window is not defined" and crashes the whole render. Native
 * (iOS/Android) never hits this branch since there's no SSR step; the guard
 * only matters for `expo start --web` / `expo export --platform web`.
 */
const ssrSafeStorage = {
  getItem: (key: string) =>
    typeof window === "undefined" ? Promise.resolve(null) : AsyncStorage.getItem(key),
  setItem: (key: string, value: string) =>
    typeof window === "undefined" ? Promise.resolve() : AsyncStorage.setItem(key, value),
  removeItem: (key: string) =>
    typeof window === "undefined" ? Promise.resolve() : AsyncStorage.removeItem(key),
};

/**
 * Same Supabase project as the web (Next.js) app. Session storage uses
 * AsyncStorage (not expo-secure-store) because a Supabase session object —
 * access token + refresh token + metadata — routinely exceeds SecureStore's
 * 2048-byte per-item limit; this is Supabase's own documented pattern for
 * React Native. RLS enforces per-farmer ownership identically to the web
 * client — no backend change needed for auth or CRUD.
 */
export const supabase = createClient(url, anonKey, {
  auth: {
    storage: ssrSafeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
