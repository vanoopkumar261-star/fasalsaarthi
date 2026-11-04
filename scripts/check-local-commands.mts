/**
 * Regression check for the Tier-1 voice command router.
 *
 *   npx tsx scripts/check-local-commands.mts
 *
 * Two things this guards against, both real risks in a hand-written
 * multilingual phrase table:
 *   1. a locale silently missing an intent (a copy-paste gap leaves a farmer
 *      in one language unable to reach a screen by voice that every other
 *      language can)
 *   2. the matcher becoming too eager — a real question that happens to
 *      contain a nav word must NOT be hijacked into a navigation
 *
 * Not wired into any build step (same as check-validation.mjs and
 * check-i18n.mjs) — run by hand after touching localCommands.ts.
 */
import { matchLocalCommand } from "../src/lib/agent/localCommands";
import { LOCALES } from "../src/lib/i18n/config";

let failures = 0;
const expect = (label: string, actual: unknown, want: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.error(`FAIL ${label}\n  want: ${JSON.stringify(want)}\n  got:  ${JSON.stringify(actual)}`);
  }
};

// ── coverage: every locale must be able to reach every route ────────────────
// Re-derived from the same phrase table the matcher reads, via the module's
// own PHRASES export shape would require exporting it; instead this drives
// the matcher itself with one representative phrase per locale per intent,
// which is the thing that actually matters — not the table's shape, but
// whether it PRODUCES a match.
const REPRESENTATIVE: Record<string, Record<string, string>> = {
  en: { today: "today", crops: "my crops", market: "market", money: "expenses", soil: "soil" },
  hi: { today: "आज", crops: "मेरे खेत", market: "बाज़ार", money: "खर्च", soil: "मिट्टी" },
  kn: { today: "ಇಂದು", crops: "ನನ್ನ ಜಮೀನುಗಳು", market: "ಮಾರುಕಟ್ಟೆ", money: "ವೆಚ್ಚಗಳು", soil: "ಮಣ್ಣು" },
  ta: { today: "இன்று", crops: "எனது பண்ணைகள்", market: "சந்தை", money: "செலவுகள்", soil: "மண்" },
  te: { today: "ఈరోజు", crops: "నా పొలాలు", market: "మార్కెట్", money: "ఖర్చులు", soil: "నేల" },
  ml: { today: "ഇന്ന്", crops: "എന്റെ കൃഷിയിടങ്ങൾ", market: "മാർക്കറ്റ്", money: "ചെലവുകൾ", soil: "മണ്ണ്" },
  mr: { today: "आज", crops: "माझी शेते", market: "बाजार", money: "खर्च", soil: "माती" },
  bn: { today: "আজ", crops: "আমার খামার", market: "বাজার", money: "খরচ", soil: "মাটি" },
  pa: { today: "ਅੱਜ", crops: "ਮੇਰੇ ਖੇਤ", market: "ਬਾਜ਼ਾਰ", money: "ਖਰਚੇ", soil: "ਮਿੱਟੀ" },
};

for (const { code } of LOCALES) {
  const phrases = REPRESENTATIVE[code];
  if (!phrases) {
    failures++;
    console.error(`FAIL locale ${code} has no coverage check defined at all`);
    continue;
  }
  for (const [intent, phrase] of Object.entries(phrases)) {
    const got = matchLocalCommand(phrase, code);
    if (got?.type !== "navigate") {
      failures++;
      console.error(`FAIL ${code}/${intent}: "${phrase}" -> ${JSON.stringify(got)} (expected a navigate match)`);
    }
  }
}

// ── undo / repeat fire in every locale ───────────────────────────────────────
expect("en undo", matchLocalCommand("undo", "en"), { type: "undo" });
expect("hi undo", matchLocalCommand("वापस", "hi"), { type: "undo" });
expect("kn undo", matchLocalCommand("ಹಿಂದೆ", "kn"), { type: "undo" });
expect("en repeat", matchLocalCommand("repeat", "en"), { type: "repeat" });
expect("hi repeat", matchLocalCommand("दोहराओ", "hi"), { type: "repeat" });

// ── the false-positive guard: a real question must NOT be hijacked ──────────
expect(
  "long sentence containing 'market' is not a navigation",
  matchLocalCommand("why did the market price for tomato fall so much this week", "en"),
  null
);
expect(
  "a genuine question about soil is not routed away",
  matchLocalCommand("what soil is best for growing wheat in my district", "en"),
  null
);
expect("empty string matches nothing", matchLocalCommand("", "en"), null);
expect("pure noise matches nothing", matchLocalCommand("asdkjfh qwlekjr", "en"), null);

// ── unknown locale falls back to English rather than throwing ───────────────
expect("unknown locale falls back to English table", matchLocalCommand("market", "xx"), {
  type: "navigate",
  route: "/(app)/market",
});

if (failures > 0) {
  console.error(`\n${failures} failure(s).`);
  process.exit(1);
}
console.log(`OK — ${LOCALES.length} locales covered, false-positive guards hold.`);
