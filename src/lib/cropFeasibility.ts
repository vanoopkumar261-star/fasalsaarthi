/**
 * Can this crop actually be grown on this field?
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * The crop step offers recommendations, but it also has a free-text box so a
 * farmer can name something the model did not suggest. That box accepted
 * anything. A farmer could type "Apple" onto a 2-acre black-soil plot in
 * Mysuru at pH 8.1 and the whole app would then quietly build on it: irrigation
 * schedules, a harvest date, yield estimates, market advice, the health score.
 * All of it arithmetic on a crop that will not grow there.
 *
 * So the input resists. Not by hiding the box — a farmer who knows their land
 * better than a lookup table is usually right, and the app should not pretend
 * otherwise — but by refusing the combinations that are agronomically wrong and
 * saying which condition is the problem.
 *
 * ── What it judges on ────────────────────────────────────────────────────────
 *
 * Four conditions, all of which the app already holds for the field:
 *
 *   soil pH     vs the crop's `phMin`/`phMax` in src/lib/agronomy.ts
 *   soil type   vs SOIL_FIT below
 *   temperature vs the crop's `heatThreshold`, and its cold tolerance
 *   water       the crop's demand vs what the plot's irrigation can supply
 *
 * ── Why a table and not just the model ───────────────────────────────────────
 *
 * This runs on every keystroke-settled edit of the crop box, so it has to be
 * instant and free, and it has to give the same answer twice. A table does
 * that; a model call does not. The model's job is the other half of the
 * problem — a name this table has never heard of — and that lives in
 * /api/crop-feasibility, which calls here first and only asks Groq when the
 * name is unknown.
 *
 * ── Provenance ───────────────────────────────────────────────────────────────
 *
 * ICAR and state-agriculture-department crop suitability guidance for Indian
 * conditions. These are typical ranges for a well-managed field, not a
 * guarantee about anyone's particular plot — the same standing as the FAO-56
 * water table next door in agronomy.ts, and `unsuitable` is reserved for
 * combinations that are wrong by a clear margin rather than merely marginal.
 */

import { getCropProfile, normalizeCrop, SUPPORTED_CROPS, isRainFed } from "./agronomy";

export type FeasibilityVerdict =
  /** Grows well here. */
  | "ok"
  /** Will grow, but something on this field will hold the yield back. */
  | "caution"
  /** Agronomically wrong for this field — the input is refused. */
  | "unsuitable"
  /** Not a crop this engine knows. The caller decides (model, or accept). */
  | "unknown";

/**
 * One reason behind a verdict.
 *
 * `msgKey` is an i18n key so the UI can speak the farmer's language; `label` is
 * the English rendering, kept for logs and for the AI context builder, which
 * reasons in English. Same split as HealthFactor in src/lib/health.ts.
 */
export type FeasibilityReason = {
  /** Which condition failed — also the icon the UI picks. */
  condition: "ph" | "soil" | "temperature" | "water";
  severity: "blocking" | "warning";
  label: string;
  msgKey: string;
  params?: Record<string, string | number>;
};

export type FeasibilityResult = {
  verdict: FeasibilityVerdict;
  /** Canonical crop name when recognised, else the trimmed input. */
  crop: string;
  reasons: FeasibilityReason[];
  /** Crops from the app's vocabulary that do suit this field. */
  alternatives: string[];
};

export type FieldConditions = {
  soilType?: string | null;
  /** Latest measured pH for the holding, when the farmer has logged one. */
  soilPh?: number | null;
  irrigation?: string | null;
  /** Typical daytime high, °C. The forecast's max is a good enough stand-in. */
  typicalHighC?: number | null;
  /** Typical overnight low, °C — what decides frost-sensitive crops. */
  typicalLowC?: number | null;
};

/**
 * Soil types each crop performs on, by the canonical crop key.
 *
 * `avoid` is the agronomically wrong pairing and is what blocks; anything not
 * listed in either array is simply unremarkable and passes. Paddy on sandy soil
 * is the classic example — it will germinate, and then the water it needs
 * ponded on the surface drains straight through.
 */
const SOIL_FIT: Record<string, { best?: string[]; avoid?: string[] }> = {
  paddy: { best: ["clay", "clayey", "black"], avoid: ["sandy", "sandy loam"] },
  wheat: { best: ["loam", "loamy", "alluvial"], avoid: ["sandy"] },
  groundnut: { best: ["sandy loam", "sandy", "red"], avoid: ["clay", "clayey"] },
  potato: { best: ["sandy loam", "loam", "loamy"], avoid: ["clay", "clayey"] },
  cotton: { best: ["black", "clay", "clayey"], avoid: ["sandy"] },
  sugarcane: { best: ["loam", "loamy", "clay", "clayey", "alluvial"], avoid: ["sandy"] },
  bajra: { best: ["sandy", "sandy loam", "red"], avoid: ["clay", "clayey"] },
  jowar: { best: ["black", "loam", "loamy", "red"] },
  ragi: { best: ["red", "loam", "loamy", "sandy loam"] },
  maize: { best: ["loam", "loamy", "alluvial", "red"], avoid: ["clay", "clayey"] },
  soybean: { best: ["black", "loam", "loamy"], avoid: ["sandy"] },
  mustard: { best: ["loam", "loamy", "alluvial", "sandy loam"] },
  gram: { best: ["loam", "loamy", "black", "sandy loam"], avoid: ["clay", "clayey"] },
  pigeonpea: { best: ["loam", "loamy", "red", "black"], avoid: ["clay", "clayey"] },
  onion: { best: ["loam", "loamy", "sandy loam", "alluvial"], avoid: ["clay", "clayey"] },
  tomato: { best: ["loam", "loamy", "sandy loam", "red"], avoid: ["clay", "clayey"] },
  chilli: { best: ["loam", "loamy", "black", "red"] },
  turmeric: { best: ["loam", "loamy", "red", "sandy loam"], avoid: ["clay", "clayey"] },
  banana: { best: ["loam", "loamy", "alluvial", "clay", "clayey"], avoid: ["sandy"] },
  sunflower: { best: ["loam", "loamy", "black", "sandy loam"] },
  sesame: { best: ["sandy loam", "loam", "loamy", "red"], avoid: ["clay", "clayey"] },
  castor: { best: ["red", "sandy loam", "loam", "loamy"] },
  safflower: { best: ["black", "loam", "loamy"], avoid: ["sandy"] },
  linseed: { best: ["loam", "loamy", "black", "alluvial"], avoid: ["sandy"] },
  niger: { best: ["red", "loam", "loamy", "sandy loam"] },
};

/**
 * Crops that will not set a crop in sustained heat, with the daytime high at
 * which it stops being worth planting.
 *
 * Distinct from `heatThreshold` in agronomy.ts, which is about stress on a crop
 * already in the ground at a sensitive stage. This is about whether to plant at
 * all, so the bar sits higher: a tomato at 36 °C is stressed, a tomato where
 * the season's highs sit at 42 °C will not fruit.
 */
const HEAT_CEILING: Record<string, number> = {
  potato: 36,
  wheat: 40,
  mustard: 38,
  linseed: 38,
  gram: 40,
  tomato: 42,
  onion: 42,
  safflower: 42,
};

/** Crops that need a genuinely cool season; the value is the high above which they fail. */
const NEEDS_COOL_SEASON: Record<string, number> = {
  wheat: 38,
  mustard: 36,
  potato: 34,
  gram: 38,
  linseed: 36,
};

function norm(s?: string | null): string {
  return (s ?? "").trim().toLowerCase();
}

/** True when the farm's soil string mentions any of these soil words. */
function soilMatches(soilType: string, list?: string[]): boolean {
  if (!list?.length) return false;
  return list.some((want) => soilType.includes(want));
}

/** Is this name something the agronomy table actually knows? */
export function isKnownCrop(name: string): boolean {
  const key = normalizeCrop(name);
  // normalizeCrop falls back to the generic profile for anything unrecognised,
  // so the only reliable test is whether the resolved profile is a real row.
  return getCropProfile(key).displayName !== "Crop";
}

/**
 * Judges one crop against one field. Pure, instant, same answer every time.
 *
 * Returns `unknown` for a name the table has no row for — this function does
 * not guess, and the caller is expected to escalate that case.
 */
export function assessCropFeasibility(
  cropName: string,
  conditions: FieldConditions,
  /**
   * Internal. `suitableAlternatives` screens candidates through this same
   * function, and a candidate that blocks would otherwise ask for alternatives
   * of its own — which screens every crop again, each of those asking again.
   * The flag cuts that off at the first level; nothing outside this module
   * passes it.
   */
  withAlternatives = true
): FeasibilityResult {
  const raw = (cropName ?? "").trim();
  if (!raw) {
    return { verdict: "unknown", crop: raw, reasons: [], alternatives: [] };
  }

  if (!isKnownCrop(raw)) {
    return { verdict: "unknown", crop: raw, reasons: [], alternatives: [] };
  }

  const key = normalizeCrop(raw);
  const profile = getCropProfile(key);
  const display = profile.displayName;
  const reasons: FeasibilityReason[] = [];

  const soilType = norm(conditions.soilType);
  const ph = typeof conditions.soilPh === "number" ? conditions.soilPh : null;
  const high = typeof conditions.typicalHighC === "number" ? conditions.typicalHighC : null;
  const low = typeof conditions.typicalLowC === "number" ? conditions.typicalLowC : null;

  // ── pH ────────────────────────────────────────────────────────────────────
  // A full point outside the crop's band is a different field, not a marginal
  // one: nutrients lock up and no amount of fertiliser compensates within a
  // season. Inside that one-point margin it is a warning, because liming or
  // gypsum genuinely does move it.
  if (ph !== null) {
    if (ph < profile.phMin - 1.0 || ph > profile.phMax + 1.0) {
      reasons.push({
        condition: "ph",
        severity: "blocking",
        label: `Soil pH ${ph.toFixed(1)} is well outside ${display}'s range of ${profile.phMin}-${profile.phMax}`,
        msgKey: "feasibility.ph.blocking",
        params: { ph: ph.toFixed(1), crop: display, min: profile.phMin, max: profile.phMax },
      });
    } else if (ph < profile.phMin || ph > profile.phMax) {
      reasons.push({
        condition: "ph",
        severity: "warning",
        label: `Soil pH ${ph.toFixed(1)} is just outside ${display}'s preferred ${profile.phMin}-${profile.phMax}`,
        msgKey: "feasibility.ph.warning",
        params: { ph: ph.toFixed(1), crop: display, min: profile.phMin, max: profile.phMax },
      });
    }
  }

  // ── Soil type ─────────────────────────────────────────────────────────────
  if (soilType) {
    const fit = SOIL_FIT[key];
    if (soilMatches(soilType, fit?.avoid)) {
      reasons.push({
        condition: "soil",
        severity: "blocking",
        label: `${display} does not perform on ${conditions.soilType} soil`,
        msgKey: "feasibility.soil.blocking",
        params: { crop: display, soil: conditions.soilType ?? "" },
      });
    }
  }

  // ── Temperature ───────────────────────────────────────────────────────────
  if (high !== null) {
    const ceiling = HEAT_CEILING[key];
    const coolCeiling = NEEDS_COOL_SEASON[key];
    if (ceiling !== undefined && high >= ceiling) {
      reasons.push({
        condition: "temperature",
        severity: "blocking",
        label: `Daytime highs near ${Math.round(high)}°C are too hot for ${display} to set a crop`,
        msgKey: "feasibility.temp.blocking",
        params: { temp: Math.round(high), crop: display },
      });
    } else if (coolCeiling !== undefined && high >= coolCeiling) {
      reasons.push({
        condition: "temperature",
        severity: "warning",
        label: `${display} wants a cooler season than ${Math.round(high)}°C highs`,
        msgKey: "feasibility.temp.warning",
        params: { temp: Math.round(high), crop: display },
      });
    } else if (high >= profile.heatThreshold + 4) {
      reasons.push({
        condition: "temperature",
        severity: "warning",
        label: `${Math.round(high)}°C is above ${display}'s comfortable ${profile.heatThreshold}°C`,
        msgKey: "feasibility.temp.warning",
        params: { temp: Math.round(high), crop: display },
      });
    }
  }
  // Frost-sensitive perennials are a planting decision, not a stress event.
  if (low !== null && low <= 2 && (key === "banana" || key === "turmeric" || key === "sugarcane")) {
    reasons.push({
      condition: "temperature",
      severity: "blocking",
      label: `${display} will not survive lows near ${Math.round(low)}°C`,
      msgKey: "feasibility.cold.blocking",
      params: { temp: Math.round(low), crop: display },
    });
  }

  // ── Water ─────────────────────────────────────────────────────────────────
  // A water-heavy crop on a rain-fed plot has no fallback at all. Paddy and
  // sugarcane on rain alone is the single most expensive mistake in this list,
  // so it blocks; the others warn.
  if (conditions.irrigation !== undefined && conditions.irrigation !== null) {
    if (profile.water.ponded && isRainFed(conditions.irrigation)) {
      reasons.push({
        condition: "water",
        severity: "blocking",
        label: `${display} is grown under standing water and this plot is rain-fed`,
        msgKey: "feasibility.water.blocking",
        params: { crop: display },
      });
    } else if (profile.waterHeavy && isRainFed(conditions.irrigation)) {
      reasons.push({
        condition: "water",
        severity: "warning",
        label: `${display} needs heavy irrigation and this plot is rain-fed`,
        msgKey: "feasibility.water.warning",
        params: { crop: display },
      });
    }
  }

  const blocking = reasons.some((r) => r.severity === "blocking");
  const verdict: FeasibilityVerdict = blocking ? "unsuitable" : reasons.length ? "caution" : "ok";

  return {
    verdict,
    crop: display,
    reasons,
    alternatives: blocking && withAlternatives ? suitableAlternatives(conditions, key) : [],
  };
}

/**
 * Crops from the app's own vocabulary that clear every blocking test on this
 * field — so a refusal can offer somewhere to go rather than just saying no.
 */
export function suitableAlternatives(
  conditions: FieldConditions,
  exclude?: string,
  limit = 4
): string[] {
  const out: string[] = [];
  for (const name of SUPPORTED_CROPS) {
    const key = normalizeCrop(name);
    if (key === exclude) continue;
    // `false` stops a blocking candidate from asking for alternatives of its
    // own, which would re-screen the whole vocabulary once per candidate.
    const r = assessCropFeasibility(name, conditions, false);
    if (r.verdict === "ok") out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}
