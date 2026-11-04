/**
 * One-off generator for the bundled agent phrase pack.
 *
 * Run once (or whenever a phrase's wording changes) against the local
 * MMS-TTS server, then commit the resulting .wav files and the generated
 * require-map. Not a build step — Metro cannot statically bundle a file that
 * doesn't exist yet, so this has to run before `expo start`/EAS build sees
 * these assets for the first time.
 *
 *   cd ml && .venv/Scripts/python.exe -m uvicorn server:app --port 8008
 *   node scripts/generate-agent-phrases.mjs        (from agent-farmer-mobile/)
 *
 * Why only six phrases, not thirty: Metro requires a literal `require()` call
 * per asset — no dynamic path is bundlable — so every phrase this pack grows
 * by is another line in phraseAssets.ts, by hand or by re-running this
 * generator. Six was chosen as the set an offline farmer hits often enough to
 * be worth the disk space: an in-flight filler, save/undo confirmations, two
 * error strings, and the undo prompt. Everything else still falls through to
 * tier 2 (the server) or tier 3 (haptic + text) — this pack only removes the
 * network round trip for the phrases spoken most often.
 *
 * ⚠ Same caveat as every other translated string this session: text is
 * machine-authored and wants a native speaker's pass before being treated as
 * final wording — this script just turns whatever is in PHRASES into audio.
 */
import fs from "node:fs";
import path from "node:path";

const ML = process.env.INFERENCE_URL?.replace(/\/+$/, "") || "http://127.0.0.1:8008";
const OUT_DIR = path.join(process.cwd(), "assets", "agent-phrases");

// Mirrors src/lib/i18n/mobile.ts's agent.* keys exactly — kept as a literal
// copy here (not imported) because this is a one-time Node script generating
// assets, not app runtime code.
const PHRASES = {
  en: {
    checking: "Checking...",
    saved: "Saved.",
    undone: "Undone.",
    errorGeneric: "Something went wrong. Please try again.",
    errorOffline: "I need the internet for that.",
    undoPrompt: "Say undo, or tap here to undo this.",
  },
  hi: {
    checking: "जाँच हो रही है...",
    saved: "सेव हो गया।",
    undone: "वापस कर दिया गया।",
    errorGeneric: "कुछ गलत हो गया। कृपया फिर से कोशिश करें।",
    errorOffline: "इसके लिए इंटरनेट चाहिए।",
    undoPrompt: "वापस बोलें, या इसे वापस करने के लिए यहाँ टैप करें।",
  },
  kn: {
    checking: "ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ...",
    saved: "ಉಳಿಸಲಾಗಿದೆ.",
    undone: "ಹಿಂದಕ್ಕೆ ತೆಗೆದುಕೊಳ್ಳಲಾಗಿದೆ.",
    errorGeneric: "ಏನೋ ತಪ್ಪಾಗಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    errorOffline: "ಇದಕ್ಕೆ ಇಂಟರ್ನೆಟ್ ಬೇಕು.",
    undoPrompt: "ಹಿಂದೆ ಎಂದು ಹೇಳಿ, ಅಥವಾ ಇದನ್ನು ಹಿಂತೆಗೆದುಕೊಳ್ಳಲು ಇಲ್ಲಿ ಒತ್ತಿ.",
  },
  ta: {
    checking: "சரிபார்க்கிறது...",
    saved: "சேமிக்கப்பட்டது.",
    undone: "திரும்பப் பெறப்பட்டது.",
    errorGeneric: "ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்.",
    errorOffline: "இதற்கு இணையம் தேவை.",
    undoPrompt: "திரும்பப் பெறு என்று சொல்லுங்கள், அல்லது இதைத் திரும்பப் பெற இங்கே தட்டவும்.",
  },
  te: {
    checking: "తనిఖీ చేస్తోంది...",
    saved: "సేవ్ చేయబడింది.",
    undone: "వెనక్కి తీసుకోబడింది.",
    errorGeneric: "ఏదో తప్పు జరిగింది. దయచేసి మళ్లీ ప్రయత్నించండి.",
    errorOffline: "దీనికి ఇంటర్నెట్ కావాలి.",
    undoPrompt: "వెనక్కి అని చెప్పండి, లేదా దీన్ని వెనక్కి తీసుకోవడానికి ఇక్కడ నొక్కండి.",
  },
  ml: {
    checking: "പരിശോധിക്കുന്നു...",
    saved: "സേവ് ചെയ്തു.",
    undone: "പഴയപടിയാക്കി.",
    errorGeneric: "എന്തോ പിഴവ് സംഭവിച്ചു. വീണ്ടും ശ്രമിക്കുക.",
    errorOffline: "ഇതിന് ഇന്റർനെറ്റ് വേണം.",
    undoPrompt: "പഴയപടിയാക്കുക എന്ന് പറയുക, അല്ലെങ്കിൽ ഇത് പഴയപടിയാക്കാൻ ഇവിടെ ടാപ്പ് ചെയ്യുക.",
  },
  mr: {
    checking: "तपासत आहे...",
    saved: "जतन केले.",
    undone: "पूर्ववत केले.",
    errorGeneric: "काहीतरी चूक झाली. कृपया पुन्हा प्रयत्न करा.",
    errorOffline: "यासाठी इंटरनेट हवे.",
    undoPrompt: "पूर्ववत करा असे बोला, किंवा हे पूर्ववत करण्यासाठी येथे टॅप करा.",
  },
  bn: {
    checking: "যাচাই করা হচ্ছে...",
    saved: "সংরক্ষিত হয়েছে।",
    undone: "ফিরিয়ে নেওয়া হয়েছে।",
    errorGeneric: "কিছু ভুল হয়েছে। আবার চেষ্টা করুন।",
    errorOffline: "এর জন্য ইন্টারনেট দরকার।",
    undoPrompt: "ফিরিয়ে নাও বলুন, অথবা এটি ফিরিয়ে নিতে এখানে চাপুন।",
  },
  pa: {
    checking: "ਜਾਂਚ ਹੋ ਰਹੀ ਹੈ...",
    saved: "ਸੇਵ ਹੋ ਗਿਆ।",
    undone: "ਵਾਪਸ ਕਰ ਦਿੱਤਾ ਗਿਆ।",
    errorGeneric: "ਕੁਝ ਗਲਤ ਹੋ ਗਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
    errorOffline: "ਇਸ ਲਈ ਇੰਟਰਨੈੱਟ ਚਾਹੀਦਾ ਹੈ।",
    undoPrompt: "ਵਾਪਸ ਬੋਲੋ, ਜਾਂ ਇਸਨੂੰ ਵਾਪਸ ਕਰਨ ਲਈ ਇੱਥੇ ਟੈਪ ਕਰੋ।",
  },
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function synth(text, locale) {
  const res = await fetch(`${ML}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, locale }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const health = await fetch(`${ML}/health`).then((r) => r.ok).catch(() => false);
  if (!health) {
    console.error(`ml/server.py not reachable at ${ML}. Start it first:`);
    console.error(`  cd ml && .venv/Scripts/python.exe -m uvicorn server:app --port 8008`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const generated = []; // { locale, key, relPath }
  for (const [locale, phrases] of Object.entries(PHRASES)) {
    for (const [key, text] of Object.entries(phrases)) {
      const relPath = `${locale}-${key}.wav`;
      const outPath = path.join(OUT_DIR, relPath);
      process.stdout.write(`  ${locale}/${key} ... `);
      try {
        const wav = await synth(text, locale);
        fs.writeFileSync(outPath, wav);
        generated.push({ locale, key, relPath });
        console.log(`${wav.length} bytes`);
      } catch (e) {
        console.log(`FAILED: ${e.message}`);
      }
      await sleep(150); // TTS isn't the rate-limited endpoint here, but be polite to the local server
    }
  }

  // Metro needs a literal require() per asset — no computed path is bundlable —
  // so the map itself has to be generated code, not a runtime lookup over a
  // directory listing.
  const lines = [
    "/**",
    " * GENERATED by scripts/generate-agent-phrases.mjs — do not hand-edit.",
    " * Re-run the generator after changing a phrase's wording or adding a key.",
    " *",
    " * Metro requires a literal `require()` call per asset; a computed path is",
    " * not bundlable, which is why this file exists instead of a directory scan.",
    " */",
    'export const AGENT_PHRASE_AUDIO: Record<string, Record<string, number>> = {',
  ];
  const byLocale = {};
  for (const { locale, key, relPath } of generated) {
    (byLocale[locale] ??= []).push({ key, relPath });
  }
  for (const [locale, entries] of Object.entries(byLocale)) {
    lines.push(`  ${locale}: {`);
    for (const { key, relPath } of entries) {
      lines.push(`    ${key}: require("../../../assets/agent-phrases/${relPath}"),`);
    }
    lines.push(`  },`);
  }
  lines.push("};");

  const mapPath = path.join(process.cwd(), "src", "lib", "agent", "phraseAssets.ts");
  fs.writeFileSync(mapPath, lines.join("\n") + "\n", "utf8");

  console.log(`\n${generated.length}/${Object.values(PHRASES).reduce((n, p) => n + Object.keys(p).length, 0)} phrases generated`);
  console.log(`assets: ${path.relative(process.cwd(), OUT_DIR)}`);
  console.log(`map:    ${path.relative(process.cwd(), mapPath)}`);
}

main().catch((e) => {
  console.error("generation failed:", e);
  process.exit(2);
});
