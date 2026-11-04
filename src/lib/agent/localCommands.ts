import type { Locale } from "../i18n/config";

/**
 * Tier 1 of the voice architecture: a deterministic phrase match that
 * short-circuits BEFORE the transcribed text ever reaches /api/chat.
 *
 * ⚠ Correction to the original plan: this does NOT make voice work "in
 * airplane mode". Transcription is still a cloud Whisper call
 * (/api/transcribe) — there is no on-device STT in this app, by design (see
 * the architecture plan's cuts). What this tier actually buys is real but
 * narrower: for the highest-frequency commands, it saves the Groq chat call,
 * the RAG retrieval, and their latency and rate-limit cost, by matching on
 * the text Whisper already produced rather than asking a model to interpret
 * it. A network round trip still happened; a second, more expensive one did
 * not.
 *
 * Phrases here are NOT new translations — they are the exact strings already
 * shown on the hub and nav labels (nav.market, hub.soil, etc., from
 * src/lib/i18n/base.ts and mobile.ts). A farmer who can read "ಮಾರುಕಟ್ಟೆ" on
 * the market button saying that exact word is the most natural command
 * there is, and it is vocabulary the app already displays, not something
 * invented for this file. The undo phrases are the one exception — those are
 * carried over from the web repo's accuracy benchmark
 * (agent-farmer/scripts/dryrun/fixtures/phrases.mjs), where they were already
 * measured to transcribe correctly.
 *
 * Deliberately NOT included, with reasons:
 *   - "read this screen" — cut. The only entry point to this router today is
 *     VoiceRoute, reached exclusively by long-pressing the hub's mic. By the
 *     time a command is matched, the current screen IS the voice modal, not
 *     whatever the farmer was looking at before — so "read this screen"
 *     would read the hub, which has nothing worth reading aloud. Revisit once
 *     a screen has its own dictate entry point, not the hub's.
 *   - "stop" — cut. A close (X) button already exists on the voice screen;
 *      true speech barge-in is Phase 4 scope in the architecture plan.
 *   - "change language" — cut deliberately, not just unbuilt. Setting the
 *     WRONG language from a misheard word is a much worse failure than
 *     opening the picker for a manual, safe tap — a farmer locked into a
 *     language they cannot read cannot ask to be un-locked. This one always
 *     routes to the picker screen, never sets a locale directly.
 */

export type LocalCommand =
  | { type: "navigate"; route: string }
  | { type: "undo" }
  | { type: "repeat" }
  | { type: "setLanguage"; code: Locale };

/**
 * Language requests, matched on-device so "only hindi" switches instantly
 * instead of falling through to the model (which used to answer it with the
 * farming disclaimer). This reverses the original "never set language by voice"
 * cut — now made safe because VoiceAgent speaks a confirmation in the NEW
 * language and the language picker is always one tap away to undo.
 *
 * The farmer names a TARGET language, possibly in a different script from the
 * current one, so this table is locale-independent: each language's romanised
 * name plus its own and the Devanagari endonym (the most commonly mixed-in
 * script). Anything this misses still falls through to the server set_language
 * tool.
 */
const LANGUAGE_REQUESTS: { code: Locale; phrases: string[] }[] = [
  { code: "en", phrases: ["english", "angrezi", "angreji", "inglish", "अंग्रेज़ी", "अंग्रेजी", "इंग्लिश", "ஆங்கிலம்", "ఇంగ్లీష్", "ഇംഗ്ലീഷ്", "ইংরেজি", "ਅੰਗਰੇਜ਼ੀ", "इंग्रजी"] },
  { code: "hi", phrases: ["hindi", "हिंदी", "हिन्दी", "ಹಿಂದಿ", "இந்தி", "హిందీ", "ഹിന്ദി", "হিন্দি", "ਹਿੰਦੀ"] },
  { code: "kn", phrases: ["kannada", "ಕನ್ನಡ", "कन्नड़", "कन्नड"] },
  { code: "ta", phrases: ["tamil", "தமிழ்", "तमिल", "तमिळ"] },
  { code: "te", phrases: ["telugu", "తెలుగు", "तेलुगु", "तेलगु"] },
  { code: "ml", phrases: ["malayalam", "മലയാളം", "मलयालम"] },
  { code: "mr", phrases: ["marathi", "मराठी", "ಮರಾಠಿ"] },
  { code: "bn", phrases: ["bengali", "bangla", "বাংলা", "बंगाली", "बांग्ला"] },
  { code: "pa", phrases: ["punjabi", "panjabi", "ਪੰਜਾਬੀ", "पंजाबी"] },
];

/** Intent key -> the actual expo-router path. */
const ROUTES: Record<string, string> = {
  today: "/(app)/today",
  crops: "/(app)/crops",
  assistant: "/(app)/assistant",
  settings: "/(app)/settings",
  soil: "/(app)/soil",
  alerts: "/(app)/alerts",
  scan: "/(app)/scan",
};

type PhraseTable = Record<string, string[]>; // intent key -> phrase variants

/**
 * One primary phrase per intent per locale, taken verbatim from the labels
 * already shipped in src/lib/i18n/{base,mobile}.ts. English carries two or
 * three variants because it is the language most likely to be spoken in a
 * mix with English loanwords ("open the market" as well as just "market").
 */
const PHRASES: Record<Locale, PhraseTable> = {
  en: {
    today: ["today", "home", "today's tasks"],
    crops: ["my farms", "crops", "my crops"],
    assistant: ["ai assistant", "assistant", "chat"],
    market: ["market", "mandi", "open the market"],
    news: ["news"],
    learn: ["library"],
    money: ["expenses", "money", "expense tracker"],
    schemes: ["gov. schemes", "government schemes", "schemes"],
    settings: ["settings"],
    soil: ["soil"],
    alerts: ["alerts", "warnings"],
    scan: ["scan leaf", "scan", "camera"],
    stores: ["shops", "stores", "nearby shops"],
    undo: ["undo"],
    repeat: ["repeat", "say that again", "say again"],
  },
  hi: {
    today: ["आज"],
    crops: ["मेरे खेत"],
    assistant: ["एआई सहायक"],
    market: ["बाज़ार"],
    news: ["समाचार"],
    learn: ["लाइब्रेरी"],
    money: ["खर्च"],
    schemes: ["सरकारी योजनाएँ"],
    settings: ["सेटिंग्स"],
    soil: ["मिट्टी"],
    alerts: ["चेतावनियाँ"],
    scan: ["पत्ती जाँच"],
    stores: ["दुकानें"],
    undo: ["वापस"],
    repeat: ["दोहराओ", "फिर से बोलो"],
  },
  kn: {
    today: ["ಇಂದು"],
    crops: ["ನನ್ನ ಜಮೀನುಗಳು"],
    assistant: ["ಎಐ ಸಹಾಯಕ"],
    market: ["ಮಾರುಕಟ್ಟೆ"],
    news: ["ಸುದ್ದಿ"],
    learn: ["ಗ್ರಂಥಾಲಯ"],
    money: ["ವೆಚ್ಚಗಳು"],
    schemes: ["ಸರ್ಕಾರಿ ಯೋಜನೆಗಳು"],
    settings: ["ಸೆಟ್ಟಿಂಗ್‌ಗಳು"],
    soil: ["ಮಣ್ಣು"],
    alerts: ["ಎಚ್ಚರಿಕೆಗಳು"],
    scan: ["ಎಲೆ ಪರೀಕ್ಷೆ"],
    stores: ["ಅಂಗಡಿಗಳು"],
    undo: ["ಹಿಂದೆ"],
    repeat: ["ಪುನಃ ಹೇಳಿ", "ಮತ್ತೆ ಹೇಳಿ"],
  },
  ta: {
    today: ["இன்று"],
    crops: ["எனது பண்ணைகள்"],
    assistant: ["ஏஐ உதவியாளர்"],
    market: ["சந்தை"],
    news: ["செய்திகள்"],
    learn: ["நூலகம்"],
    money: ["செலவுகள்"],
    schemes: ["அரசு திட்டங்கள்"],
    settings: ["அமைப்புகள்"],
    soil: ["மண்"],
    alerts: ["எச்சரிக்கைகள்"],
    scan: ["இலை பரிசோதனை"],
    stores: ["கடைகள்"],
    undo: ["திரும்ப"],
    repeat: ["மீண்டும் சொல்லு", "மறுபடி சொல்லு"],
  },
  te: {
    today: ["ఈరోజు"],
    crops: ["నా పొలాలు"],
    assistant: ["ఏఐ సహాయకుడు"],
    market: ["మార్కెట్"],
    news: ["వార్తలు"],
    learn: ["గ్రంథాలయం"],
    money: ["ఖర్చులు"],
    schemes: ["ప్రభుత్వ పథకాలు"],
    settings: ["సెట్టింగ్‌లు"],
    soil: ["నేల"],
    alerts: ["హెచ్చరికలు"],
    scan: ["ఆకు పరీక్ష"],
    stores: ["దుకాణాలు"],
    undo: ["వెనక్క"],
    repeat: ["మళ్లీ చెప్పు", "మళ్ళీ చెప్పండి"],
  },
  ml: {
    today: ["ഇന്ന്"],
    crops: ["എന്റെ കൃഷിയിടങ്ങൾ"],
    assistant: ["എഐ അസിസ്റ്റന്റ്"],
    market: ["മാർക്കറ്റ്"],
    news: ["വാർത്തകൾ"],
    learn: ["ലൈബ്രറി"],
    money: ["ചെലവുകൾ"],
    schemes: ["സർക്കാർ പദ്ധതികൾ"],
    settings: ["ക്രമീകരണങ്ങൾ"],
    soil: ["മണ്ണ്"],
    alerts: ["മുന്നറിയിപ്പുകൾ"],
    scan: ["ഇല പരിശോധന"],
    stores: ["കടകൾ"],
    undo: ["പഴയപടി"],
    repeat: ["വീണ്ടും പറയൂ", "ഒന്നുകൂടി പറയൂ"],
  },
  mr: {
    today: ["आज"],
    crops: ["माझी शेते"],
    assistant: ["एआय सहाय्यक"],
    market: ["बाजार"],
    news: ["बातम्या"],
    learn: ["लायब्ररी"],
    money: ["खर्च"],
    schemes: ["सरकारी योजना"],
    settings: ["सेटिंग्ज"],
    soil: ["माती"],
    alerts: ["इशारे"],
    scan: ["पान तपासणी"],
    stores: ["दुकाने"],
    undo: ["मागे"],
    repeat: ["पुन्हा सांगा", "परत सांगा"],
  },
  bn: {
    today: ["আজ"],
    crops: ["আমার খামার"],
    assistant: ["এআই সহায়ক"],
    market: ["বাজার"],
    news: ["সংবাদ"],
    learn: ["লাইব্রেরি"],
    money: ["খরচ"],
    schemes: ["সরকারি প্রকল্প"],
    settings: ["সেটিংস"],
    soil: ["মাটি"],
    alerts: ["সতর্কতা"],
    scan: ["পাতা পরীক্ষা"],
    stores: ["দোকান"],
    undo: ["ফিরি"],
    repeat: ["আবার বলো", "আবার বলুন"],
  },
  pa: {
    today: ["ਅੱਜ"],
    crops: ["ਮੇਰੇ ਖੇਤ"],
    assistant: ["ਏਆਈ ਸਹਾਇਕ"],
    market: ["ਬਾਜ਼ਾਰ"],
    news: ["ਖ਼ਬਰਾਂ"],
    learn: ["ਲਾਇਬ੍ਰੇਰੀ"],
    money: ["ਖਰਚੇ"],
    schemes: ["ਸਰਕਾਰੀ ਯੋਜਨਾਵਾਂ"],
    settings: ["ਸੈਟਿੰਗਾਂ"],
    soil: ["ਮਿੱਟੀ"],
    alerts: ["ਚੇਤਾਵਨੀਆਂ"],
    scan: ["ਪੱਤਾ ਜਾਂਚ"],
    stores: ["ਦੁਕਾਨਾਂ"],
    undo: ["ਵਾਪਸ"],
    repeat: ["ਦੁਬਾਰਾ ਬੋਲੋ", "ਫਿਰ ਬੋਲੋ"],
  },
};

/** Strips punctuation and collapses whitespace. Case-folding is harmless no-op for Indic scripts. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,!?;:।॥"'`()\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Matches transcribed speech against the phrase table. Conservative on
 * purpose: only short utterances are even considered (a real question is
 * rarely six words or fewer), and a match requires the phrase to cover a
 * meaningful share of what was said — a bare "market" matches on
 * "open the market", but "why did market prices fall" does not, because
 * mis-routing to a screen the farmer did not ask for is worse than falling
 * through to the assistant, which still answers sensibly either way.
 */
/** A target language named in the utterance (any script), or null. */
function matchLanguageRequest(heard: string): Locale | null {
  let best: { code: Locale; len: number } | null = null;
  for (const { code, phrases } of LANGUAGE_REQUESTS) {
    for (const raw of phrases) {
      const phrase = normalize(raw);
      if (!phrase || !heard.includes(phrase)) continue;
      // Same coverage guard as the navigation match: the language name must be
      // a real share of the utterance, not an incidental substring.
      if (phrase.length / heard.length < 0.35) continue;
      if (!best || phrase.length > best.len) best = { code, len: phrase.length };
    }
  }
  return best?.code ?? null;
}

export function matchLocalCommand(heardText: string, locale: string): LocalCommand | null {
  const heard = normalize(heardText);
  if (!heard) return null;
  if (heard.split(" ").length > 6) return null;

  // Language requests first: "only hindi", "अंग्रेज़ी", "in marathi" switch
  // immediately rather than falling through to the model.
  const lang = matchLanguageRequest(heard);
  if (lang) return { type: "setLanguage", code: lang };

  const table = PHRASES[locale as Locale] ?? PHRASES.en;
  let best: { intent: string; phrase: string } | null = null;

  for (const [intent, phrases] of Object.entries(table)) {
    for (const raw of phrases) {
      const phrase = normalize(raw);
      if (!phrase) continue;
      if (heard.includes(phrase)) {
        // Coverage guard: the matched phrase must be a real fraction of the
        // utterance, not an incidental substring inside a longer sentence.
        if (phrase.length / heard.length < 0.35) continue;
        if (!best || phrase.length > best.phrase.length) best = { intent, phrase };
      }
    }
  }

  if (!best) return null;
  if (best.intent === "undo") return { type: "undo" };
  if (best.intent === "repeat") return { type: "repeat" };
  const route = ROUTES[best.intent];
  return route ? { type: "navigate", route } : null;
}
