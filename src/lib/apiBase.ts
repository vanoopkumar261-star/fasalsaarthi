import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Base URL of the main Next.js app's own API routes — used for anything that
 * needs a server secret (Groq key, DATA_GOV_API_KEY) or heavier server logic.
 *
 * ## Why this is not just the env var
 *
 * `EXPO_PUBLIC_API_BASE_URL` has spent most of this project's life set to
 * `http://localhost:3000`, which is correct on the web, correct in the Android
 * emulator only via its own alias, and **wrong on a real phone**: there,
 * `localhost` is the phone. It appeared to work because `adb reverse tcp:3000`
 * was usually up, so the failure was invisible while the USB cable was
 * plugged in and total the moment it was not — mandi prices, input prices,
 * schemes, the assistant and transcription all quietly stopped, with each
 * screen reporting only that its own data had failed.
 *
 * In a development build the right host is already known: Metro is being
 * served from the laptop, so whatever address the bundle was downloaded from
 * is the address the API is on too. `hostUri` is exactly that, so the port is
 * swapped and nothing needs configuring — it keeps working when the router
 * hands out a different IP, which a hardcoded LAN address does not.
 *
 * A configured URL still wins whenever it names a real host, so a deployed
 * build pointing at Vercel is untouched. Only a loopback address is
 * overridden, and only on a device, where it cannot have been right anyway.
 */

/** The machine serving this bundle, as `host:port`, in a dev build. */
function metroHost(): string | null {
  const candidates = [
    Constants.expoConfig?.hostUri,
    // Older/Expo Go shapes. Harmless to read and occasionally the only one set.
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost,
    (Constants as unknown as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2?.extra
      ?.expoClient?.hostUri,
  ];
  for (const raw of candidates) {
    if (typeof raw !== "string" || !raw) continue;
    // "192.168.1.5:8081" or "exp://192.168.1.5:8081/--/path"
    const host = raw.replace(/^[a-z]+:\/\//i, "").split("/")[0].split(":")[0];
    if (host) return host;
  }
  return null;
}

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/i;

function resolveBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? "";

  // The browser is the one place loopback is genuinely right.
  if (Platform.OS === "web") return configured;

  let configuredHost = "";
  try {
    if (configured) configuredHost = new URL(configured).hostname;
  } catch {
    // Not a parseable URL — leave it exactly as configured rather than
    // second-guessing it, and let the first fetch report the real problem.
    return configured;
  }

  if (configured && !LOOPBACK.test(configuredHost)) return configured;

  const host = metroHost();
  if (!host) return configured; // production build with a loopback URL: nothing better to offer

  // Keep whatever port and scheme were configured; only the host was wrong.
  let port = "3000";
  try {
    if (configured) port = new URL(configured).port || "3000";
  } catch {
    /* already handled above */
  }
  return `http://${host}:${port}`;
}

export const API_BASE_URL = resolveBaseUrl();

// One line at startup, because "which server is this build talking to?" has
// been guessed at more than once and is answerable in a single log.
if (__DEV__) console.log(`API BASE: ${API_BASE_URL || "(none configured)"}`);
