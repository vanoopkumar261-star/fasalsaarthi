import { Vibration } from "react-native";
import { API_BASE_URL } from "./apiBase";
import { authHeaders } from "./authHeaders";
import { beginSpeaking, endSpeaking } from "./agent/audioLock";
import { toSpeakableText } from "./plainText";

/**
 * Text-to-speech, resolved lazily so the app still runs on a dev build that
 * predates a given native module being added. A missing module makes speaking
 * a no-op rather than a crash — the UI must never depend on it having worked.
 */
let mod: typeof import("expo-speech") | null | undefined;

function speech() {
  if (mod === undefined) {
    try {
      mod = require("expo-speech");
    } catch {
      mod = null;
    }
  }
  return mod;
}

let audioMod: typeof import("expo-audio") | null | undefined;
function audio() {
  if (audioMod === undefined) {
    try {
      audioMod = require("expo-audio");
    } catch {
      audioMod = null; // needs `expo-file-system` + `expo-audio` linked — see README
    }
  }
  return audioMod;
}

let fsMod: typeof import("expo-file-system") | null | undefined;
function fs() {
  if (fsMod === undefined) {
    try {
      fsMod = require("expo-file-system");
    } catch {
      fsMod = null;
    }
  }
  return fsMod;
}

const BCP47: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  kn: "kn-IN",
  ta: "ta-IN",
  te: "te-IN",
  ml: "ml-IN",
  mr: "mr-IN",
  bn: "bn-IN",
  pa: "pa-IN",
};

/**
 * Whether the DEVICE (not the app) actually has a voice for this locale —
 * checked by listing installed voices rather than assuming one exists, which
 * is what the old code did. On most Android handsets that assumption held for
 * English and Hindi and silently failed for the other seven.
 *
 * Cached per session: `getAvailableVoicesAsync` is a native round trip and the
 * installed voice set does not change while the app is running.
 */
let voiceCache: Set<string> | null = null;
let voiceList: { identifier: string; language: string }[] = [];
let voicesLoading: Promise<void> | null = null;

function loadVoices(): Promise<void> {
  const s = speech();
  if (!s?.getAvailableVoicesAsync) return Promise.resolve();
  voicesLoading ??= s
    .getAvailableVoicesAsync()
    .then((voices) => {
      voiceList = voices;
      voiceCache = new Set(voices.map((v: { language: string }) => v.language));
    })
    .catch(() => {
      voiceCache = new Set();
    });
  return voicesLoading;
}

/**
 * Starts the Android TTS engine and reads its voice list at app launch, so the
 * first "read aloud" doesn't pay the 1–2 s cold engine start.
 */
export function warmUpSpeech(): void {
  loadVoices();
}

async function deviceHasVoice(locale: string): Promise<boolean> {
  await loadVoices();
  if (!voiceCache) return false;
  const tag = BCP47[locale] ?? "en-IN";
  // Match the exact tag first, then just the base language (some Android
  // builds register "hi" without the "-IN" region suffix).
  return voiceCache.has(tag) || voiceCache.has(tag.split("-")[0]);
}

/**
 * The on-device voice for this locale. Left to itself, Google TTS picks its
 * *network* voice whenever the phone is online — every utterance then waits on
 * a server round trip (3–5 s on a rural connection). Its offline voices are
 * named "…-local"; pinning one makes speech start immediately.
 */
const pickedVoice = new Map<string, string | undefined>();

function localVoice(locale: string): string | undefined {
  if (pickedVoice.has(locale)) return pickedVoice.get(locale);
  const tag = (BCP47[locale] ?? "en-IN").toLowerCase();
  const base = tag.split("-")[0];
  const sameLang = voiceList.filter((v) => v.language.toLowerCase().replace("_", "-").startsWith(base));
  const exact = sameLang.filter((v) => v.language.toLowerCase().replace("_", "-") === tag);
  const pool = exact.length ? exact : sameLang;
  const voice = pool.find((v) => /-local$/i.test(v.identifier))?.identifier;
  pickedVoice.set(locale, voice);
  return voice;
}

/** In-memory only — cleared on app restart. Keyed by locale + a cheap text hash. */
const audioCache = new Map<string, string>(); // -> file:// uri

function cacheKey(text: string, locale: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `${locale}:${h}`;
}

/**
 * Tier 2: the self-hosted MMS-TTS server via /api/tts, for the seven locales
 * that usually have no installed device voice. expo-audio's player needs a
 * file:// path, not raw bytes or a data: URI (confirmed against the installed
 * SDK 57 types — no such source is documented), so the response is written to
 * disk before playback, and reused by content hash on repeat.
 *
 * SDK 57 replaced expo-file-system's old string-path functions with a
 * class-based File/Directory/Paths API — `File.write()` takes a Uint8Array
 * directly, so no base64 round trip is needed to get bytes onto disk.
 *
 * Returns false on any failure — caller falls through to the text+haptic tier.
 */
async function tryServerTts(text: string, locale: string): Promise<boolean> {
  if (!API_BASE_URL) return false;
  const a = audio();
  const f = fs();
  if (!a || !f) return false;

  try {
    const key = cacheKey(text, locale);
    let uri = audioCache.get(key);

    if (!uri) {
      const res = await fetch(`${API_BASE_URL}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ text, locale }),
      });
      if (!res.ok) return false; // 401 signed-out, 503 no inference server — both expected
      const buf = await res.arrayBuffer();

      const file = new f.File(f.Paths.cache, `agent-tts-${key}.wav`);
      file.create({ overwrite: true });
      file.write(new Uint8Array(buf));
      uri = file.uri;
      audioCache.set(key, uri);
    }

    const player = a.createAudioPlayer(uri);
    beginSpeaking();
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        endSpeaking();
        try {
          player.remove();
        } catch {
          /* already released */
        }
        resolve(ok);
      };
      player.addListener("playbackStatusUpdate", (status: { didJustFinish?: boolean }) => {
        if (status.didJustFinish) finish(true);
      });
      player.play();
      // A player that never fires didJustFinish (corrupt file, codec issue) must
      // not hang the caller forever.
      setTimeout(() => finish(true), 20_000);
    });
  } catch {
    return false;
  }
}

/** Which tier actually produced the sound — lets a caller show an honest hint. */
export type SpeakResult = "device" | "server" | "silent";

/**
 * Speaks `text` in `locale`, trying three tiers in order and stopping at the
 * first that works:
 *   1. the device's own installed voice — instant, offline, needs nothing
 *   2. the self-hosted MMS-TTS server via /api/tts — covers the locales the
 *      device usually cannot speak, at the cost of a network round trip
 *   3. neither: a haptic pulse, so a silent device is a felt event rather
 *      than a dead one. The caller must still render the reply as text —
 *      this function does not touch the screen.
 *
 * Returns which tier fired, because "no voice was heard" is no longer a
 * static per-module fact once a server fallback exists — it can only be
 * known after trying.
 *
 * Always routes through the audio lock: the mic must never be open while any
 * tier of this is speaking.
 */
export async function speak(text: string, locale: string): Promise<SpeakResult> {
  // Markdown is stripped HERE rather than at the call sites.
  //
  // The assistant writes Markdown and the synthesiser reads it literally: a
  // voice saying "star star P M KISAN star star" is worse than one saying
  // nothing, and it hits exactly the farmers who most need the reply read to
  // them. This used to be applied by the one screen that spoke model output,
  // and was lost the moment the speaking moved into VoiceAgent — so it now
  // lives at the single point every caller already funnels through, where it
  // cannot be dropped by moving a call. Plain labels pass through untouched.
  text = toSpeakableText(text);
  if (!text.trim()) return "silent";

  // Prefer the server voice (NVIDIA calm/expressive — slower, lower-pitched) for
  // warmth; the phone's own voice is flat. Fall back to it when offline or when
  // the server has no voice for this locale.
  if (await tryServerTts(text, locale)) return "server";

  if (await deviceHasVoice(locale)) {
    const s = speech();
    if (s) {
      try {
        beginSpeaking();
        s.stop();
        await new Promise<void>((resolve) => {
          const say = (voice: string | undefined) =>
            s.speak(text, {
              language: BCP47[locale] ?? "en-IN",
              voice,
              rate: 0.95,
              onDone: () => resolve(),
              onStopped: () => resolve(),
              onError: () => {
                // The offline voice may be listed but not downloaded: forget it
                // and let the engine choose, rather than staying silent.
                if (!voice) return resolve();
                pickedVoice.set(locale, undefined);
                say(undefined);
              },
            });
          say(localVoice(locale));
        });
      } finally {
        endSpeaking();
      }
      return "device";
    }
  }

  // Tier 3: no voice anywhere. Felt, not heard.
  Vibration.vibrate(120);
  return "silent";
}

/** Stops whichever tier is currently speaking. Safe to call when idle. */
export function stopSpeaking(): void {
  try {
    speech()?.stop();
  } catch {
    /* no-op module */
  }
  endSpeaking();
}

/** True only if the DEVICE can speak this locale without a network call. */
export async function deviceSpeechAvailable(locale: string): Promise<boolean> {
  return deviceHasVoice(locale);
}

/** Legacy sync check — true if expo-speech exists at all, regardless of locale. */
export function speechAvailable(): boolean {
  return speech() != null;
}
