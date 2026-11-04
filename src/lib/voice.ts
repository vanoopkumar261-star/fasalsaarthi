import { File } from "expo-file-system";
import { API_BASE_URL } from "./apiBase";
import { authHeaders } from "./authHeaders";

/** ISO-639-1 codes Whisper takes for its `language` hint. */
const ISO639: Record<string, string> = {
  en: "en",
  hi: "hi",
  kn: "kn",
  ta: "ta",
  te: "te",
  ml: "ml",
  mr: "mr",
  bn: "bn",
  pa: "pa",
};

/**
 * Speech to text via the web app's /api/transcribe (Groq whisper-large-v3-turbo).
 *
 * Recognition works for all nine languages server-side — it is only playback
 * that is patchy, which is why the reply always appears as text as well as
 * being spoken.
 */
export async function transcribe(uri: string, locale: string): Promise<{ text: string; locale?: string; error?: string }> {
  if (!API_BASE_URL) return { text: "", error: "No server configured." };
  try {
    const form = new FormData();
    // SDK 57's global fetch/FormData (Expo's own "winter" runtime, not React
    // Native's classic one) dropped support for the old `{ uri, name, type }`
    // form-data shape entirely — appending one throws "Unsupported
    // FormDataPart implementation" at request time. It only accepts an actual
    // Blob-like value (anything with `.bytes()`), which is exactly what
    // expo-file-system's File class is for.
    //
    // The route sniffs container magic bytes rather than trusting this type;
    // expo-audio records m4a on Android, which it accepts via the ftyp box.
    const file = new File(uri);
    form.append("audio", file, "speech.m4a");
    form.append("locale", ISO639[locale] ?? "en");

    const res = await fetch(`${API_BASE_URL}/api/transcribe`, {
      method: "POST",
      body: form,
      headers: await authHeaders(),
    });
    const json = await res.json();
    if (!res.ok) return { text: "", error: json?.error ?? "Could not transcribe." };
    // `locale` is the language actually spoken (en/hi auto-detect, web route).
    return { text: (json?.text ?? "").trim(), locale: typeof json?.locale === "string" ? json.locale : undefined };
  } catch (e) {
    console.error("TRANSCRIBE error:", e);
    return { text: "", error: "Couldn't reach the speech service." };
  }
}
