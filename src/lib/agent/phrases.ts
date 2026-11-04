import { beginSpeaking, endSpeaking } from "./audioLock";
import { AGENT_PHRASE_AUDIO } from "./phraseAssets";

/**
 * Plays one of the ~6 pre-synthesized agent phrases — tier 0, ahead of even
 * the device voice check in speech.ts. Bundled at build time by
 * scripts/generate-agent-phrases.mjs, so this is genuinely zero-latency and
 * works with no network and no installed device voice, in all nine languages.
 *
 * This is deliberately separate from speak() in speech.ts: speak() handles
 * arbitrary text the model produces, and has to try three tiers because it
 * cannot know in advance what it will be given. A phrase key is always one of
 * a small fixed set whose audio already exists, so there is nothing to try —
 * only to play.
 */
export type PhraseKey = "checking" | "saved" | "undone" | "errorGeneric" | "errorOffline" | "undoPrompt";

let audioMod: typeof import("expo-audio") | null | undefined;
function audio() {
  if (audioMod === undefined) {
    try {
      audioMod = require("expo-audio");
    } catch {
      audioMod = null;
    }
  }
  return audioMod;
}

/** True if this phrase has bundled audio for this locale (falls back to English otherwise). */
export function hasPhraseAudio(key: PhraseKey, locale: string): boolean {
  return Boolean(AGENT_PHRASE_AUDIO[locale]?.[key] ?? AGENT_PHRASE_AUDIO.en?.[key]);
}

/**
 * Plays the bundled clip for `key` in `locale`, falling back to the English
 * clip if this locale's audio is missing (should not happen for the six keys
 * the generator covers, but a locale added later without a re-run of the
 * generator degrades to English rather than throwing).
 *
 * Returns false without playing anything if no audio exists at all — callers
 * should fall through to speak() with the equivalent i18n text in that case.
 */
export async function speakPhrase(key: PhraseKey, locale: string): Promise<boolean> {
  const a = audio();
  const asset = AGENT_PHRASE_AUDIO[locale]?.[key] ?? AGENT_PHRASE_AUDIO.en?.[key];
  if (!a || asset === undefined) return false;

  try {
    const player = a.createAudioPlayer(asset);
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
      setTimeout(() => finish(true), 10_000); // these clips are all under 10s; never hang longer than that
    });
  } catch {
    endSpeaking();
    return false;
  }
}
