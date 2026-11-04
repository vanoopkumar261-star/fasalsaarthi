/**
 * Did the farmer say yes, or no?
 *
 * Used for a one-shot spoken confirmation — e.g. after a disease scan, "want me
 * to explain what I found?". The question is explicitly yes/no, so the bar is
 * low: find a clear affirmation or a clear refusal and act on it; anything else
 * is "neither", and the caller decides what to do (we treat it as a fresh
 * command rather than guessing).
 *
 * Matched across scripts because the farmer answers in whatever language they
 * are speaking, which may differ from the app's current locale. Transcription
 * is fuzzy, so these are substrings, not exact words. Deliberately short:
 * padding the lists invites a long sentence tripping one of them by accident.
 */

const YES = [
  // English / romanised, the forms Whisper most often returns
  "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "please", "go ahead", "tell me", "explain",
  "haan", "ha ", " ha", "haa", "ji", "jee", "bolo", "batao", "bata do", "sunao", "samjhao",
  // native "yes" per language
  "हाँ", "हां", "जी", "बताओ", "समझाओ", // hi / mr
  "ಹೌದು", "ಹೇಳಿ",                      // kn
  "ஆம்", "சரி", "சொல்லு",              // ta
  "అవును", "చెప్పు",                   // te
  "അതെ", "പറയൂ",                       // ml
  "হ্যাঁ", "বলো",                       // bn
  "ਹਾਂ", "ਦੱਸੋ",                        // pa
];

const NO = [
  "no", "nope", "nah", "not now", "later", "stop", "cancel", "skip",
  "nahi", "nahin", "mat", "rehne do", "nako",
  "नहीं", "मत", // hi / mr
  "ಬೇಡ",        // kn
  "இல்லை", "வேண்டாம்", // ta
  "వద్దు", "లేదు",     // te
  "വേണ്ട", "ഇല്ല",     // ml
  "না", "লাগবে না",    // bn
  "ਨਹੀਂ", "ਨਾ",        // pa
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[.,!?;:।॥"'`()\-]/g, " ").replace(/\s+/g, " ").trim();
}

function hits(text: string, table: string[]): boolean {
  const t = ` ${norm(text)} `;
  return table.some((w) => t.includes(norm(w)));
}

export function isAffirmative(text: string): boolean {
  // A clear "no" wins even if a yes-word also appears ("no, not that one").
  if (hits(text, NO)) return false;
  return hits(text, YES);
}

export function isNegative(text: string): boolean {
  if (hits(text, NO)) return true;
  return false;
}
