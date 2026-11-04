/**
 * Crop-aware agronomy engine — the single source of truth for crop timing,
 * growth stage, tasks and yield. Pure and isomorphic: no DB, no next/headers,
 * so it is safe to import from both client (onboarding) and server (dashboard).
 *
 * Replaces the old flat "120-day cycle for every crop" assumption with
 * per-crop cycle lengths, proportional growth stages, stage-specific tasks and
 * India-typical yield estimates.
 */

export type StageLabel =
  | "Germination"
  | "Seedling"
  | "Vegetative"
  | "Flowering"
  | "Maturity";

export const STAGE_LABELS: StageLabel[] = [
  "Germination",
  "Seedling",
  "Vegetative",
  "Flowering",
  "Maturity",
];

// Fraction of the cycle at which each stage ENDS. These reproduce the original
// 7 / 25 / 55 / 90-of-120-day thresholds, now applied proportionally so they
// scale to any crop's cycle length.
const STAGE_BOUNDS: { label: StageLabel; end: number }[] = [
  { label: "Germination", end: 0.06 },
  { label: "Seedling", end: 0.21 },
  { label: "Vegetative", end: 0.46 },
  { label: "Flowering", end: 0.75 },
  { label: "Maturity", end: 1.0 },
];

/**
 * Per-crop water behaviour — the FAO-56 inputs.
 *
 * Ported from the website's agronomy.ts unchanged, including the numbers, so
 * the irrigation engine on either surface reaches the same answer for the same
 * field. A farmer who checks the phone against the dashboard must not be told
 * two different things.
 */
export type CropWater = {
  /** Initial stage — bare soil, mostly evaporation. */
  kcIni: number;
  /** Mid-season — full canopy, peak demand. */
  kcMid: number;
  /** Late season — senescing, drying down for harvest. */
  kcEnd: number;
  /** Maximum effective rooting depth, metres. */
  rootDepthM: number;
  /** p — fraction of available water that may be depleted before stress. */
  depletionFraction: number;
  /**
   * Grown under standing water rather than to a depletion trigger.
   *
   * Paddy is not "a thirsty crop" — it is a different irrigation problem.
   * Scheduling it by root-zone depletion would tell a farmer to let a puddled
   * field dry out, which is wrong, so the engine branches on this instead.
   */
  ponded?: boolean;
};

export type CropProfile = CropBase & { water: CropWater };

type CropBase = {
  displayName: string;
  cycleDays: number; // seeding → harvest
  yieldPerAcre: number; // typical, in quintals per acre
  waterHeavy: boolean; // needs standing water / heavy irrigation
  heatThreshold: number; // °C above which heat stress bites at sensitive stages
  /**
   * The soil-pH band this crop actually yields well in. Used by `soilFix()` to
   * judge a reading against the crop that is standing in the field, instead of
   * against a generic "most crops like 6-7.5" range — a paddy grower at pH 5.6
   * is fine, a cotton grower at the same reading is not.
   */
  phMin: number;
  phMax: number;
  oilseed?: boolean; // part of the oilseed group (mustard, groundnut, sesame…)
};

const DEFAULT_PROFILE: CropBase = {
  displayName: "Crop",
  cycleDays: 120,
  yieldPerAcre: 18,
  waterHeavy: false,
  heatThreshold: 38,
  // The general Indian field-crop range. A crop typed freehand lands here, so
  // the pH advice degrades to the old generic guidance rather than breaking.
  phMin: 6.0,
  phMax: 7.5,
};

// India-typical values. cycleDays = seeding → harvest; yieldPerAcre in quintals.
// Rough but sensible for advisory/demo use — refine per state/variety later.
const CROP_TABLE: Record<string, CropBase> = {
  paddy: { displayName: "Paddy", cycleDays: 120, yieldPerAcre: 25, waterHeavy: true, heatThreshold: 37, phMin: 5.0, phMax: 6.5 },
  wheat: { displayName: "Wheat", cycleDays: 140, yieldPerAcre: 18, waterHeavy: false, heatThreshold: 33, phMin: 6.0, phMax: 7.5 },
  maize: { displayName: "Maize", cycleDays: 100, yieldPerAcre: 24, waterHeavy: false, heatThreshold: 38, phMin: 5.5, phMax: 7.5 },
  bajra: { displayName: "Bajra", cycleDays: 80, yieldPerAcre: 12, waterHeavy: false, heatThreshold: 42, phMin: 6.0, phMax: 8.0 },
  jowar: { displayName: "Jowar", cycleDays: 110, yieldPerAcre: 14, waterHeavy: false, heatThreshold: 40, phMin: 6.0, phMax: 7.5 },
  ragi: { displayName: "Ragi", cycleDays: 110, yieldPerAcre: 12, waterHeavy: false, heatThreshold: 38, phMin: 5.0, phMax: 7.5 },
  groundnut: { displayName: "Groundnut", cycleDays: 110, yieldPerAcre: 10, waterHeavy: false, heatThreshold: 38, phMin: 6.0, phMax: 7.0, oilseed: true },
  cotton: { displayName: "Cotton", cycleDays: 170, yieldPerAcre: 8, waterHeavy: false, heatThreshold: 40, phMin: 6.0, phMax: 8.0 },
  soybean: { displayName: "Soybean", cycleDays: 100, yieldPerAcre: 12, waterHeavy: false, heatThreshold: 38, phMin: 6.0, phMax: 7.5, oilseed: true },
  sugarcane: { displayName: "Sugarcane", cycleDays: 330, yieldPerAcre: 350, waterHeavy: true, heatThreshold: 40, phMin: 6.0, phMax: 7.5 },
  onion: { displayName: "Onion", cycleDays: 140, yieldPerAcre: 120, waterHeavy: false, heatThreshold: 36, phMin: 6.0, phMax: 7.0 },
  tomato: { displayName: "Tomato", cycleDays: 110, yieldPerAcre: 100, waterHeavy: false, heatThreshold: 35, phMin: 6.0, phMax: 7.0 },
  potato: { displayName: "Potato", cycleDays: 100, yieldPerAcre: 100, waterHeavy: false, heatThreshold: 30, phMin: 5.0, phMax: 6.5 },
  chilli: { displayName: "Chilli", cycleDays: 150, yieldPerAcre: 8, waterHeavy: false, heatThreshold: 38, phMin: 6.0, phMax: 7.0 },
  mustard: { displayName: "Mustard", cycleDays: 120, yieldPerAcre: 6, waterHeavy: false, heatThreshold: 32, phMin: 6.0, phMax: 7.5, oilseed: true },
  gram: { displayName: "Gram", cycleDays: 120, yieldPerAcre: 8, waterHeavy: false, heatThreshold: 33, phMin: 6.0, phMax: 7.5 },
  pigeonpea: { displayName: "Pigeonpea", cycleDays: 160, yieldPerAcre: 6, waterHeavy: false, heatThreshold: 40, phMin: 6.0, phMax: 7.5 },
  turmeric: { displayName: "Turmeric", cycleDays: 270, yieldPerAcre: 90, waterHeavy: true, heatThreshold: 38, phMin: 5.0, phMax: 7.5 },
  banana: { displayName: "Banana", cycleDays: 330, yieldPerAcre: 250, waterHeavy: true, heatThreshold: 38, phMin: 6.0, phMax: 7.5 },
  sunflower: { displayName: "Sunflower", cycleDays: 100, yieldPerAcre: 8, waterHeavy: false, heatThreshold: 38, phMin: 6.0, phMax: 7.5, oilseed: true },
  sesame: { displayName: "Sesame", cycleDays: 90, yieldPerAcre: 3, waterHeavy: false, heatThreshold: 42, phMin: 5.5, phMax: 8.0, oilseed: true },
  castor: { displayName: "Castor", cycleDays: 150, yieldPerAcre: 7, waterHeavy: false, heatThreshold: 42, phMin: 5.5, phMax: 8.0, oilseed: true },
  safflower: { displayName: "Safflower", cycleDays: 130, yieldPerAcre: 5, waterHeavy: false, heatThreshold: 36, phMin: 6.0, phMax: 8.0, oilseed: true },
  linseed: { displayName: "Linseed", cycleDays: 120, yieldPerAcre: 4, waterHeavy: false, heatThreshold: 33, phMin: 6.0, phMax: 7.0, oilseed: true },
  niger: { displayName: "Niger", cycleDays: 100, yieldPerAcre: 2, waterHeavy: false, heatThreshold: 36, phMin: 5.0, phMax: 6.5, oilseed: true },
};

// Map common synonyms/regional names onto the canonical table keys.
const ALIASES: Record<string, string> = {
  rice: "paddy",
  "pearl millet": "bajra",
  sorghum: "jowar",
  "finger millet": "ragi",
  peanut: "groundnut",
  tur: "pigeonpea",
  arhar: "pigeonpea",
  "red gram": "pigeonpea",
  "bengal gram": "gram",
  chickpea: "gram",
  chana: "gram",
  soya: "soybean",
  "soya bean": "soybean",
  chilly: "chilli",
  chili: "chilli",
  "chili pepper": "chilli",
  mirchi: "chilli",
  brinjal: "tomato",
  // Oilseed regional / trade names.
  rapeseed: "mustard",
  sarson: "mustard",
  toria: "mustard",
  canola: "mustard",
  til: "sesame",
  gingelly: "sesame",
  sesamum: "sesame",
  arandi: "castor",
  kardi: "safflower",
  flaxseed: "linseed",
  alsi: "linseed",
  ramtil: "niger",
  moongphali: "groundnut",
};

/**
 * Every crop the engine has real data for, by display name.
 *
 * This is the app's crop vocabulary and three things depend on it agreeing:
 * the agronomy table (cycle length, yield, heat threshold), the onboarding
 * photo pack in public/images/crops, and the prompt that asks the model for
 * recommendations. Derived from CROP_TABLE so adding a crop in one place
 * updates all three — "Crop" is the generic fallback entry and is excluded.
 */
/**
 * Per-crop water behaviour, keyed by the same canonical names as CROP_TABLE.
 *
 * Kept as a second table rather than six more columns on CROP_TABLE so the
 * agronomic provenance sits in one place and the existing rows — which four
 * other features already read — did not all have to be rewritten to add a
 * feature none of them use.
 */
const WATER_TABLE: Record<string, CropWater> = {
  paddy:      { kcIni: 1.05, kcMid: 1.20, kcEnd: 0.90, rootDepthM: 0.6, depletionFraction: 0.20, ponded: true },
  wheat:      { kcIni: 0.30, kcMid: 1.15, kcEnd: 0.30, rootDepthM: 1.2, depletionFraction: 0.55 },
  maize:      { kcIni: 0.30, kcMid: 1.20, kcEnd: 0.50, rootDepthM: 1.2, depletionFraction: 0.55 },
  bajra:      { kcIni: 0.30, kcMid: 1.00, kcEnd: 0.30, rootDepthM: 1.2, depletionFraction: 0.55 },
  jowar:      { kcIni: 0.30, kcMid: 1.05, kcEnd: 0.55, rootDepthM: 1.2, depletionFraction: 0.55 },
  ragi:       { kcIni: 0.30, kcMid: 1.00, kcEnd: 0.35, rootDepthM: 0.8, depletionFraction: 0.55 },
  groundnut:  { kcIni: 0.40, kcMid: 1.15, kcEnd: 0.60, rootDepthM: 0.7, depletionFraction: 0.50 },
  cotton:     { kcIni: 0.35, kcMid: 1.18, kcEnd: 0.60, rootDepthM: 1.3, depletionFraction: 0.65 },
  soybean:    { kcIni: 0.40, kcMid: 1.15, kcEnd: 0.50, rootDepthM: 1.0, depletionFraction: 0.50 },
  sugarcane:  { kcIni: 0.40, kcMid: 1.25, kcEnd: 0.75, rootDepthM: 1.5, depletionFraction: 0.65 },
  onion:      { kcIni: 0.70, kcMid: 1.05, kcEnd: 0.75, rootDepthM: 0.4, depletionFraction: 0.30 },
  tomato:     { kcIni: 0.60, kcMid: 1.15, kcEnd: 0.80, rootDepthM: 0.9, depletionFraction: 0.40 },
  potato:     { kcIni: 0.50, kcMid: 1.15, kcEnd: 0.75, rootDepthM: 0.5, depletionFraction: 0.35 },
  chilli:     { kcIni: 0.60, kcMid: 1.05, kcEnd: 0.90, rootDepthM: 0.7, depletionFraction: 0.30 },
  mustard:    { kcIni: 0.35, kcMid: 1.10, kcEnd: 0.35, rootDepthM: 1.1, depletionFraction: 0.60 },
  gram:       { kcIni: 0.40, kcMid: 1.00, kcEnd: 0.35, rootDepthM: 0.8, depletionFraction: 0.50 },
  pigeonpea:  { kcIni: 0.40, kcMid: 1.05, kcEnd: 0.35, rootDepthM: 1.0, depletionFraction: 0.50 },
  turmeric:   { kcIni: 0.50, kcMid: 1.05, kcEnd: 0.80, rootDepthM: 0.5, depletionFraction: 0.40 },
  banana:     { kcIni: 0.50, kcMid: 1.10, kcEnd: 1.00, rootDepthM: 0.7, depletionFraction: 0.35 },
  sunflower:  { kcIni: 0.35, kcMid: 1.15, kcEnd: 0.35, rootDepthM: 1.0, depletionFraction: 0.45 },
  sesame:     { kcIni: 0.35, kcMid: 1.10, kcEnd: 0.25, rootDepthM: 1.0, depletionFraction: 0.60 },
  castor:     { kcIni: 0.35, kcMid: 1.15, kcEnd: 0.55, rootDepthM: 1.2, depletionFraction: 0.50 },
  safflower:  { kcIni: 0.35, kcMid: 1.10, kcEnd: 0.25, rootDepthM: 1.2, depletionFraction: 0.60 },
  linseed:    { kcIni: 0.35, kcMid: 1.10, kcEnd: 0.25, rootDepthM: 1.0, depletionFraction: 0.60 },
  niger:      { kcIni: 0.35, kcMid: 1.00, kcEnd: 0.35, rootDepthM: 0.8, depletionFraction: 0.55 },
};

/**
 * The generic field crop an unrecognised name falls back to. Mid-range on every
 * axis, so a freehand crop gets advice that is vague rather than wrong.
 */
const DEFAULT_WATER: CropWater = {
  kcIni: 0.4,
  kcMid: 1.05,
  kcEnd: 0.6,
  rootDepthM: 1.0,
  depletionFraction: 0.5,
};

export const SUPPORTED_CROPS: string[] = Object.values(CROP_TABLE)
  .map((c) => c.displayName)
  .filter((n) => n !== "Crop")
  .sort();

/** Canonical oilseed crops known to the engine, in rough national-importance order. */
export const OILSEED_CROPS = [
  "mustard",
  "groundnut",
  "soybean",
  "sesame",
  "sunflower",
  "castor",
  "safflower",
  "linseed",
  "niger",
] as const;

/** Whether a crop name (any alias/spelling) belongs to the oilseed group. */
export function isOilseed(name: string): boolean {
  const key = normalizeCrop(name);
  return !!key && CROP_TABLE[key]?.oilseed === true;
}

export function normalizeCrop(name: string): string {
  const base = (name ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // drop parentheticals
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return "";
  if (CROP_TABLE[base]) return base;
  if (ALIASES[base]) return ALIASES[base];
  // try first word (e.g. "tomato hybrid" → "tomato")
  const first = base.split(" ")[0];
  if (CROP_TABLE[first]) return first;
  if (ALIASES[first]) return ALIASES[first];
  return "";
}

export function getCropProfile(name: string): CropProfile {
  const key = normalizeCrop(name);
  if (!key) {
    return { ...DEFAULT_PROFILE, displayName: name?.trim() || "Crop", water: DEFAULT_WATER };
  }
  return { ...CROP_TABLE[key], water: WATER_TABLE[key] ?? DEFAULT_WATER };
}

function daysSinceDate(dateISO: string): number {
  const then = new Date(dateISO).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/**
 * Length of this cycle in days: the farmer's own seeding → harvest window when
 * they set a harvest date, otherwise the crop table's typical cycle length.
 */
function cycleDaysFor(crop: string, seedingDate: string, estimatedHarvestDate?: string | null): number {
  const seeded = new Date(seedingDate).getTime();
  const harvest = estimatedHarvestDate ? new Date(estimatedHarvestDate).getTime() : NaN;
  if (!Number.isNaN(seeded) && !Number.isNaN(harvest) && harvest > seeded) {
    return Math.max(1, Math.round((harvest - seeded) / 86_400_000));
  }
  return getCropProfile(crop).cycleDays;
}

/**
 * Crop coefficient at a point in the cycle, interpolated rather than stepped.
 *
 * FAO-56 draws Kc as four straight segments: flat through establishment, a ramp
 * up as the canopy closes, flat at peak, then a ramp down into senescence. The
 * stage boundaries in STAGE_BOUNDS already mark those corners, so the curve is
 * read straight off them.
 *
 * Interpolating matters: stepping Kc from 0.30 to 1.15 on a single day would
 * put a false 3 mm jump in the water balance and schedule an irrigation the
 * crop did not ask for.
 */
export function kcAt(profile: CropProfile, progress: number): number {
  const { kcIni, kcMid, kcEnd } = profile.water;
  const p = Math.max(0, Math.min(1, progress));

  // Establishment: flat at the initial value through germination + seedling.
  const devStart = STAGE_BOUNDS[1].end; // end of Seedling
  const midStart = STAGE_BOUNDS[2].end; // end of Vegetative — canopy closed
  const lateStart = STAGE_BOUNDS[3].end; // end of Flowering

  if (p <= devStart) return kcIni;
  if (p < midStart) return kcIni + ((kcMid - kcIni) * (p - devStart)) / (midStart - devStart);
  if (p <= lateStart) return kcMid;
  return kcMid + ((kcEnd - kcMid) * (p - lateStart)) / (1 - lateStart);
}

/**
 * Effective rooting depth at a point in the cycle.
 *
 * Roots are not at full depth on day one — a crop that will eventually draw
 * from 1.2 m starts at about 15 cm, so its usable soil reservoir grows through
 * the season. Treating the reservoir as full-size from sowing would badly
 * overestimate how long a young crop can go between waterings.
 *
 * Expansion is complete by the time the canopy closes, which is also when
 * demand peaks.
 */
export function rootDepthAt(profile: CropProfile, progress: number): number {
  const max = profile.water.rootDepthM;
  const MIN_DEPTH_M = 0.15;
  const full = STAGE_BOUNDS[2].end; // end of Vegetative
  const p = Math.max(0, Math.min(1, progress));
  if (p >= full) return max;
  return MIN_DEPTH_M + (max - MIN_DEPTH_M) * (p / full);
}

export type CropStageInfo = {
  label: StageLabel;
  progress: number; // 0..1 through the crop's own cycle
  day: number; // days since seeding
  cycleDays: number;
};

/**
 * Crop-aware growth stage. Falls back to a 120-day cycle for unknown crops.
 * When the farmer has set their own harvest date, the stage is measured against
 * that window so the growth stage agrees with the harvest countdown.
 */
export function cropStageFor(
  crop: string,
  seedingDate: string,
  estimatedHarvestDate?: string | null
): CropStageInfo {
  const cycleDays = cycleDaysFor(crop, seedingDate, estimatedHarvestDate);
  const day = daysSinceDate(seedingDate);
  const progress = Math.min(1, day / cycleDays);
  const bound = STAGE_BOUNDS.find((b) => progress <= b.end) ?? STAGE_BOUNDS[STAGE_BOUNDS.length - 1];
  return { label: bound.label, progress, day, cycleDays };
}

/**
 * Where to draw the progress line on an evenly-spaced stage timeline.
 *
 * The two scales disagree and cannot be used interchangeably: the stage bounds
 * are uneven (6 / 21 / 46 / 75 / 100 % of the cycle) while the dots on the card
 * are laid out at equal intervals (0 / 25 / 50 / 75 / 100 %). Drawing raw
 * progress against those dots puts the line behind its own label — at day 30 of
 * 100 the crop is Vegetative, but a 30% line sits well short of the Vegetative
 * dot at 50%.
 *
 * So interpolate piecewise: find the band the crop is in, see how far through
 * that band it is, and map that onto the gap between the two dots. The line then
 * moves a little every day AND always agrees with the highlighted stage.
 */
export function stageTimelinePct(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  const lastIdx = STAGE_BOUNDS.length - 1; // 4
  let prev = 0;

  for (let i = 0; i < STAGE_BOUNDS.length; i++) {
    const end = STAGE_BOUNDS[i].end;
    if (p <= end) {
      // The final band has no dot beyond it — hold the line at the end.
      if (i >= lastIdx) return 100;
      const within = end === prev ? 1 : (p - prev) / (end - prev);
      return ((i + within) / lastIdx) * 100;
    }
    prev = end;
  }
  return 100;
}

export type HarvestInfo = {
  harvestDate: Date;
  harvestLabel: string;
  daysLeft: number;
  pct: number; // 0..100 grown
  cycleDays: number;
  estimated: boolean; // true when computed, false when the farmer set the date
};

/**
 * Crop-aware harvest countdown.
 *
 * `estimatedHarvestDate` is the farmer's own date for this cycle (onboarding, or
 * edited later). When present it wins outright: the countdown and the progress
 * bar are measured against it, so the dashboard reflects what the farmer
 * actually planned rather than the table's generic cycle length. Without it we
 * fall back to seeding date + the crop's cycle length.
 */
export function harvestInfo(
  crop: string,
  seedingDate: string,
  estimatedHarvestDate?: string | null
): HarvestInfo {
  const profile = getCropProfile(crop);
  const seeded = new Date(seedingDate).getTime();

  const override = estimatedHarvestDate ? new Date(estimatedHarvestDate).getTime() : NaN;
  const hasOverride = !Number.isNaN(override) && override > seeded;

  const harvest = hasOverride ? override : seeded + profile.cycleDays * 86_400_000;
  // Span the progress bar over the real planned window, not the generic cycle.
  const cycleDays = Math.max(1, Math.round((harvest - seeded) / 86_400_000));

  const daysLeft = Math.max(0, Math.ceil((harvest - Date.now()) / 86_400_000));
  const elapsed = Math.min(cycleDays, Math.max(0, Math.round((Date.now() - seeded) / 86_400_000)));
  const pct = Math.round((elapsed / cycleDays) * 100);

  return {
    harvestDate: new Date(harvest),
    harvestLabel: new Date(harvest).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    daysLeft,
    pct,
    cycleDays,
    estimated: !hasOverride,
  };
}

/**
 * Suggested harvest date (yyyy-mm-dd) for a crop seeded on a given day — the
 * value the onboarding form pre-fills. Returns "" when either input is unusable
 * so the caller can leave the field empty rather than showing a bogus date.
 */
export function suggestHarvestDate(crop: string, seedingDate: string): string {
  const seeded = new Date(seedingDate).getTime();
  if (!seedingDate || Number.isNaN(seeded)) return "";
  const { cycleDays } = getCropProfile(crop);
  return new Date(seeded + cycleDays * 86_400_000).toISOString().slice(0, 10);
}

/** Estimated total yield in quintals for an area (acres) of a crop. */
export function estimateYield(crop: string, areaAcres: number): number {
  const { yieldPerAcre } = getCropProfile(crop);
  return Math.round(yieldPerAcre * Math.max(0, areaAcres));
}

/** Human string stored on the crop cycle, e.g. "45 quintal (est.)". */
export function estimateYieldLabel(crop: string, areaAcres: number): string {
  return `${estimateYield(crop, areaAcres)} quintal (est.)`;
}

export type TaskSeed = {
  key: string; // stable id for dedupe / persistence
  title: string;
  meta: string;
  tone: "green" | "amber" | "blue";
  category: "irrigation" | "fertilizer" | "scouting" | "protection" | "harvest" | "general";
};

type FarmLike = {
  /** Farm row id. Task keys hang off this so they stay unique even if two farms share an index. */
  id?: string;
  farm_index: number;
  /** Used to tell rain-fed plots (moisture matters more) from irrigated ones. */
  irrigation?: string | null;
  crop: {
    chosen_crop: string;
    seeding_date: string;
    estimated_harvest_date?: string | null;
  } | null;
};

/** Rain-fed plots depend on stored soil moisture rather than a water source. */
export function isRainFed(irrigation?: string | null): boolean {
  return /rain[\s-]?fed/i.test(irrigation ?? "");
}

/** Whether rain is likely in the next 3 forecast days. */
function rainSoon(weather: { daily: { precipProb: number }[] } | null): boolean {
  return !!weather?.daily?.slice(0, 3).some((d) => d.precipProb >= 50);
}

/** Soft ceiling on the day's list — routine checks are trimmed to fit, stage work never is. */
const MAX_TASKS = 10;

/**
 * Crop-stage + weather aware task list for a set of farms. Returns typed seeds;
 * the caller decides presentation and (later) persistence.
 *
 * Two tiers: each cropped farm's stage work is always included (so the list
 * scales with the number of farms), while routine checks — leaf scouting, soil
 * moisture, weeding — only fill the space left under MAX_TASKS, keeping the day
 * readable for a farmer with several plots.
 */
export function generateTasks(
  farms: FarmLike[],
  weather: { current?: { temp: number }; daily: { precipProb: number }[] } | null
): TaskSeed[] {
  const tasks: TaskSeed[] = [];
  const routine: TaskSeed[] = [];

  for (const f of farms) {
    if (!f.crop) continue;
    const crop = f.crop.chosen_crop;
    const harvestDate = f.crop.estimated_harvest_date;
    const p = getCropProfile(crop);
    const st = cropStageFor(crop, f.crop.seeding_date, harvestDate);
    const fi = f.farm_index; // shown to the farmer
    const fk = f.id ?? String(f.farm_index); // identifies the farm in task keys
    const dayMeta = `Day ${st.day} · ${st.label} stage`;

    switch (st.label) {
      case "Germination":
      case "Seedling":
        tasks.push({
          key: `scout-early-${fk}`,
          title: `Inspect ${crop} germination — Farm ${fi}`,
          meta: dayMeta,
          tone: "green",
          category: "scouting",
        });
        if (p.waterHeavy) {
          tasks.push({
            key: `water-early-${fk}`,
            title: `Maintain shallow standing water — Farm ${fi}`,
            meta: `${crop} · keep the field moist at establishment`,
            tone: "blue",
            category: "irrigation",
          });
        }
        break;
      case "Vegetative":
        tasks.push({
          key: `fert-veg-${fk}`,
          title: `Apply nitrogen top-dressing to ${crop} — Farm ${fi}`,
          meta: dayMeta,
          tone: "amber",
          category: "fertilizer",
        });
        routine.push({
          key: `weeds-veg-${fk}`,
          title: `Check for weeds around ${crop} — Farm ${fi}`,
          meta: `${dayMeta} · weeds compete hardest now`,
          tone: "green",
          category: "scouting",
        });
        break;
      case "Flowering":
        tasks.push({
          key: `scout-flower-${fk}`,
          title: `Scout ${crop} for pests & disease at flowering — Farm ${fi}`,
          meta: `${dayMeta} · avoid water stress now`,
          tone: "amber",
          category: "scouting",
        });
        break;
      case "Maturity": {
        const h = harvestInfo(crop, f.crop.seeding_date, harvestDate);
        tasks.push({
          key: `harvest-${fk}`,
          title: `Prepare for ${crop} harvest — Farm ${fi}`,
          meta: `~${h.daysLeft} days to harvest · arrange labour & drying`,
          tone: "green",
          category: "harvest",
        });
        break;
      }
    }

    // Leaf scouting once there is a canopy to inspect — the field check that
    // feeds the disease scanner.
    if (st.label !== "Germination") {
      routine.push({
        key: `leaf-check-${fk}`,
        title: "Inspect leaves for early signs of disease",
        meta: `${crop} · Farm ${fi}`,
        tone: "blue",
        category: "protection",
      });
    }

    // Soil moisture matters most where there's no irrigation to fall back on
    // and no rain coming.
    if (isRainFed(f.irrigation) && !rainSoon(weather) && st.label !== "Maturity") {
      routine.push({
        key: `moisture-${fk}`,
        title: `Check soil moisture — Farm ${fi}`,
        meta: "Rain-fed plot · no rain forecast",
        tone: "amber",
        category: "irrigation",
      });
    }
  }

  // Weather-driven, whole-farm tasks.
  if (rainSoon(weather)) {
    tasks.push({
      key: "weather-rain",
      title: "Hold irrigation & spraying — rain expected",
      meta: "Weather · next 72 hours",
      tone: "blue",
      category: "irrigation",
    });
  }
  const temp = weather?.current?.temp;
  if (typeof temp === "number") {
    const hotFarm = farms.find((f) => {
      if (!f.crop) return false;
      const p = getCropProfile(f.crop.chosen_crop);
      const st = cropStageFor(f.crop.chosen_crop, f.crop.seeding_date, f.crop.estimated_harvest_date);
      return (st.label === "Flowering" || st.label === "Vegetative") && temp >= p.heatThreshold;
    });
    if (hotFarm) {
      tasks.push({
        key: "weather-heat",
        title: "Irrigate early morning — heat stress risk",
        meta: `${temp}°C · protect crops at a sensitive stage`,
        tone: "amber",
        category: "irrigation",
      });
    }
  }

  // Weather and stage work first, then as many routine checks as still fit.
  return [...tasks, ...routine.slice(0, Math.max(0, MAX_TASKS - tasks.length))];
}
