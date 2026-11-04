/**
 * Fails if a t("key") in the app has no English entry. A missing key falls back
 * to the key string itself, which renders as "soilPh.title" on a farmer's
 * screen — visible, but only if someone happens to look at that screen.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p) && !p.includes("i18n")) files.push(p);
  }
})("src");

const dictSrc = ["src/lib/i18n/base.ts", "src/lib/i18n/dashboard.ts", "src/lib/i18n/mobile.ts"]
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

// Only the English block of each file defines the required key set.
const enKeys = new Set();
for (const src of ["src/lib/i18n/base.ts", "src/lib/i18n/dashboard.ts", "src/lib/i18n/mobile.ts"]) {
  const text = readFileSync(src, "utf8");
  const start = text.indexOf("const en: Dict = {");
  const end = text.indexOf("\n};", start);
  for (const m of text.slice(start, end).matchAll(/"([^"]+)":/g)) enKeys.add(m[1]);
}

const missing = new Map();
const flag = (key, f) => {
  if (!missing.has(key)) missing.set(key, []);
  missing.get(key).push(f);
};

for (const f of files) {
  const text = readFileSync(f, "utf8");

  // Plain t("some.key")
  for (const m of text.matchAll(/\bt\(\s*"([^"]+)"/g)) {
    if (!enKeys.has(m[1])) flag(m[1], f);
  }

  // Interpolated t(`prefix.${x}`). These were invisible to the check above, and
  // a whole missing family shipped once: the soil picker rendered the literal
  // string "soilType.alluvial" as its label. A key built from a static prefix
  // is satisfied if ANY English key starts with that prefix.
  for (const m of text.matchAll(/\bt\(\s*`([^`$]*\.)\$\{/g)) {
    const prefix = m[1];
    let found = false;
    for (const k of enKeys) {
      if (k.startsWith(prefix)) {
        found = true;
        break;
      }
    }
    if (!found) flag(`${prefix}\${…}  (interpolated)`, f);
  }
}

console.log(`${enKeys.size} English keys defined, ${files.length} source files scanned.`);
if (missing.size === 0) {
  console.log("All translation keys resolve.");
  process.exit(0);
}
console.log(`\n${missing.size} MISSING key(s):`);
for (const [k, where] of missing) console.log(`  ${k}  <- ${[...new Set(where)].join(", ")}`);
process.exit(1);
