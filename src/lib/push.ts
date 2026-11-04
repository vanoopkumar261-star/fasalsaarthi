import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "./supabase";

/**
 * Device notifications.
 *
 * ── What works today, and what does not ─────────────────────────────────────
 * LOCAL notifications need nothing but this module: a channel, a handler, and
 * a schedule call. They work on this build right now.
 *
 * REMOTE push does not, and cannot until someone creates a Firebase project.
 * Android delivery goes through FCM, which needs a `google-services.json` in
 * `android/app/`; there is none in this repo. Note that the usual Expo route
 * for that file — `expo.android.googleServicesFile` in app.json — does
 * NOTHING here, because it is a prebuild mechanism and this project has its
 * `android/` directory checked in and builds with `gradle assembleRelease`.
 * The file has to be dropped into the native project directly.
 *
 * The SDK 57 documentation does not say what the token APIs do when that file
 * is absent — not whether they throw, resolve null, or hang. So this module
 * assumes all three: every call is wrapped, raced against a timeout, and
 * returns null on any outcome. Expo's own example helper re-throws a
 * registration error; copying that would crash the app of every farmer using
 * a build with no Firebase project, which is currently all of them.
 *
 * Nothing here is called on launch. Registration is explicit, so a build
 * without credentials never pays for a lookup that cannot succeed.
 */

/** Longer than a cold FCM lookup, short enough not to stall a screen. */
const TOKEN_TIMEOUT_MS = 8000;

const CHANNEL_ID = "default";

/**
 * Must run before any token call on Android, and before the OS will show the
 * Android 13 permission prompt at all — the prompt does not appear until at
 * least one channel exists. Also the only way to set the channel's importance
 * on this project, since the expo-notifications config plugin would need a
 * prebuild to take effect.
 */
export async function configureNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      // Sound stays off: an advisory arriving at night should not wake a
      // household. Note that on Android `shouldPlaySound: false` also
      // suppresses the heads-up banner regardless of priority, which is the
      // quieter behaviour we want for everything except a hazard warning.
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Farm alerts",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    /* channels are unsupported below Android 8 — nothing to do */
  }
}

export type PushPermission = "granted" | "denied";

export async function requestPushPermission(): Promise<PushPermission> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === "granted") return "granted";
    const asked = await Notifications.requestPermissionsAsync();
    return asked.status === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * The device's native FCM token, or null.
 *
 * `getDevicePushTokenAsync()` rather than `getExpoPushTokenAsync()` on
 * purpose: the Expo token requires an EAS `projectId` this project does not
 * have and a round trip to Expo's servers, and it exists to let Expo's push
 * service deliver on our behalf. This app has its own backend; a native token
 * is the thing that backend would send to FCM directly.
 */
export async function getDeviceToken(): Promise<string | null> {
  const result = await withTimeout(Notifications.getDevicePushTokenAsync(), TOKEN_TIMEOUT_MS);
  const data = (result as { data?: unknown } | null)?.data;
  return typeof data === "string" && data.length > 0 ? data : null;
}

/**
 * Stores the token against the farmer, so a sender can reach this handset.
 *
 * Degrades to a no-op when `push_tokens` does not exist, matching the
 * convention in tasks.ts and notifications.ts — the migration for it
 * (scripts/sql/028_push_tokens.sql in the web repo) has deliberately NOT been
 * applied, because there is no Firebase project for it to serve yet.
 */
export async function savePushToken(farmerId: string, token: string): Promise<void> {
  try {
    await supabase.from("push_tokens").upsert(
      {
        farmer_id: farmerId,
        token,
        platform: Platform.OS,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "token" }
    );
  } catch {
    /* table not applied yet — no-op */
  }
}

/**
 * The whole registration path, in one call. Returns what actually happened,
 * rather than a boolean, so a caller can tell "the farmer said no" from
 * "there is no Firebase project behind this build" — two situations that look
 * identical from a failed boolean and need different things said about them.
 */
export type RegistrationOutcome = "registered" | "denied" | "unavailable";

export async function registerForPush(farmerId: string): Promise<RegistrationOutcome> {
  await configureNotifications();

  if ((await requestPushPermission()) !== "granted") return "denied";

  const token = await getDeviceToken();
  if (!token) return "unavailable";

  await savePushToken(farmerId, token);
  return "registered";
}

/**
 * Shows a notification immediately, with no server and no Firebase involved.
 *
 * This is the half that works today, and it is not a toy: a hazard warning
 * the farmer has already fetched, or a task reminder, can be put in the
 * notification shade from the device itself.
 */
export async function notifyLocally(title: string, body?: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      // null fires it now. An object trigger would need a `type` field in
      // SDK 53+; the untyped `{ seconds }` form still in some of Expo's own
      // examples is legacy and must not be copied.
      trigger: null,
    });
  } catch {
    /* permission refused or channel missing — silently skip */
  }
}
