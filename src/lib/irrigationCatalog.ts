/**
 * The irrigation vocabulary, kept in step with the website's
 * `src/lib/irrigationCatalog.ts`.
 *
 * `farms.irrigation` used to be one free-text column answering two different
 * questions at once — Borewell/Canal/River said where the water comes from,
 * Drip/Sprinkler said how it is applied, and Rain-fed said neither. A farmer
 * on a borewell *and* drip had to throw half their answer away, and the half
 * most of them dropped is the one that matters: application efficiency is a
 * property of the method, so without it there is no way to turn "the crop
 * needs 18 mm" into "run the pump for two hours".
 *
 * Migration 029 split it into `water_regime`, `irrigation_source` and
 * `irrigation_method`. The website has asked the split question since
 * 2026-10-18; this app did not, so every farm registered on a phone since
 * then has those three columns null. The engine falls back to parsing the
 * composite, which can only ever recover ONE of the two facts — a farmer who
 * chose "Drip Irrigation" has no source, one who chose "Borewell" has no
 * method, and a null method is scheduled at 0.6 efficiency when real drip is
 * 0.9. That farmer is told to pump half as much water again as they need.
 *
 * This file is only the vocabulary and the label composer. The FAO-56 water
 * balance itself stays on the server (`/api/irrigation-advice`), per the
 * decision that the website is the brain and the app is the product.
 */

export type WaterRegime = "rainfed" | "irrigated";

export const WATER_REGIMES = ["rainfed", "irrigated"] as const;

export const IRRIGATION_SOURCES = [
  "borewell",
  "canal",
  "river",
  "tank",
  "pond",
  "lift",
  "rainwater_harvest",
] as const;

export const IRRIGATION_METHODS = [
  "drip",
  "sprinkler",
  "rain_gun",
  "furrow",
  "basin",
  "flood",
  "manual_hose",
] as const;

export type IrrigationSource = (typeof IRRIGATION_SOURCES)[number];
export type IrrigationMethod = (typeof IRRIGATION_METHODS)[number];

/**
 * English labels. These are not only for display: the composite written to the
 * legacy `farms.irrigation` column is built from them, and two downstream rules
 * match on that string — `isRainFed()` in agronomy and the health score's water
 * factor both test /rain[\s-]?fed/i. "Rain-fed" is therefore load-bearing
 * wording, not a caption.
 */
export const REGIME_EN: Record<WaterRegime, string> = {
  rainfed: "Rain-fed",
  irrigated: "Irrigated",
};

export const SOURCE_EN: Record<IrrigationSource, string> = {
  borewell: "Borewell",
  canal: "Canal",
  river: "River",
  tank: "Tank",
  pond: "Farm pond",
  lift: "Lift irrigation",
  rainwater_harvest: "Harvested rainwater",
};

export const METHOD_EN: Record<IrrigationMethod, string> = {
  drip: "Drip",
  sprinkler: "Sprinkler",
  rain_gun: "Rain gun",
  furrow: "Furrow",
  basin: "Basin",
  flood: "Flood",
  manual_hose: "Manual hose",
};

/**
 * A one-line hint under each method, because the method is the choice that
 * decides how much water the farmer is told to pump and most people pick it
 * in a second without knowing that.
 */
export const METHOD_HINT: Record<IrrigationMethod, string> = {
  drip: "Pipes and emitters at the root zone — least water wasted",
  sprinkler: "Overhead spray across the field",
  rain_gun: "A single high-throw sprinkler",
  furrow: "Water run along channels between rows",
  basin: "The field flooded in bunded squares",
  flood: "The whole field flooded",
  manual_hose: "Watered by hand with a hose or can",
};

/**
 * The composite stored in the legacy `farms.irrigation` column. Mirrors
 * `composeIrrigationLabel` on the website exactly — the two write the same
 * column and a farm must read the same whichever surface created it.
 *
 * Rain-fed renders as exactly "Rain-fed" for the reason given above.
 */
/**
 * Application efficiency — the share of water applied that actually reaches the
 * root zone. The rest is lost to evaporation, wind drift, deep percolation past
 * the roots and runoff.
 *
 * These are mid-points of the ranges in FAO Irrigation & Drainage Paper 24/56
 * and Indian extension guidance for smallholder systems. They are a starting
 * figure for a farm with no flow meter, not a measurement of this particular
 * system — a drip line with clogged emitters does far worse than 0.90 — and
 * every caller shows that caveat beside the number.
 *
 * This is the most load-bearing constant in the feature: it converts a crop's
 * water NEED into the water a farmer must actually pump.
 */
export const METHOD_EFFICIENCY: Record<IrrigationMethod, number> = {
  drip: 0.9,
  sprinkler: 0.75,
  rain_gun: 0.7,
  manual_hose: 0.65,
  furrow: 0.6,
  basin: 0.55,
  flood: 0.5,
};

/**
 * Typical system discharge in litres per hour per acre, for turning a required
 * depth into a run time.
 *
 * ── Reading these ────────────────────────────────────────────────────────────
 * 1 mm of depth over one acre is 4,047 litres, so these are roughly:
 *
 *   drip 3 mm/h · sprinkler 5 mm/h · rain gun 7 mm/h
 *   hose 2 mm/h · furrow 10 mm/h · basin & flood 12 mm/h
 *
 * which are the standard application-rate bands for each system. Drip is often
 * called "low flow", and each emitter is — but an acre carries several thousand
 * of them, so the system total is not small. Taking the per-emitter figure as
 * the per-acre figure is an easy mistake and produces advice like "run the pump
 * for thirty hours", which no farmer would follow and which would be wrong.
 *
 * Surface-method rates really depend on the pump, not the method. A farmer who
 * knows their own discharge should override this — until then the run time is
 * an estimate and the UI says so.
 */
export const METHOD_DISCHARGE_LPH_PER_ACRE: Record<IrrigationMethod, number> = {
  drip: 12000,
  sprinkler: 20000,
  rain_gun: 28000,
  manual_hose: 8000,
  furrow: 40000,
  basin: 48000,
  flood: 48000,
};

/** One acre in square metres. 1 mm of depth over 1 m² is exactly 1 litre. */
export const SQM_PER_ACRE = 4046.86;

/** Depth in mm over an area in acres → volume in litres. */
export function mmToLitres(mm: number, areaAcres: number): number {
  return mm * areaAcres * SQM_PER_ACRE;
}

export function isWaterRegime(v: unknown): v is WaterRegime {
  return typeof v === "string" && (WATER_REGIMES as readonly string[]).includes(v);
}

export function isIrrigationSource(v: unknown): v is IrrigationSource {
  return typeof v === "string" && (IRRIGATION_SOURCES as readonly string[]).includes(v);
}

export function isIrrigationMethod(v: unknown): v is IrrigationMethod {
  return typeof v === "string" && (IRRIGATION_METHODS as readonly string[]).includes(v);
}

/**
 * The human-readable string written to the legacy `farms.irrigation` column.
 *
 * That column is `not null` and is read in a dozen places — the farm chip, the
 * assistant's context block, three LLM prompts — none of which should have to
 * learn the new shape at once. Keeping it populated makes this migration
 * additive rather than a rewrite.
 *
 * Rain-fed MUST render as exactly "Rain-fed" so `isRainFed()` in `agronomy.ts`
 * and the health score's water-risk factor keep matching. Both test
 * `/rain[\s-]?fed/i` against this string; a value like "No irrigation" would
 * silently switch two rules off.
 */
export function composeIrrigationLabel(
  regime: WaterRegime,
  source?: IrrigationSource | null,
  method?: IrrigationMethod | null
): string {
  if (regime === "rainfed") return REGIME_EN.rainfed;
  const parts = [source ? SOURCE_EN[source] : null, method ? METHOD_EN[method] : null].filter(
    Boolean
  );
  return parts.length ? parts.join(" · ") : REGIME_EN.irrigated;
}

/**
 * Best-effort reading of a farm row written before the split — including every
 * farm this app itself created up to now. Mirrors `parseLegacyIrrigation` on
 * the website; keep the two in step if either changes.
 */
export function parseLegacyIrrigation(label: string | null | undefined): {
  regime: WaterRegime;
  source: IrrigationSource | null;
  method: IrrigationMethod | null;
} {
  const s = (label ?? "").trim();
  if (!s) return { regime: "irrigated", source: null, method: null };
  if (/rain[\s-]?fed/i.test(s)) return { regime: "rainfed", source: null, method: null };

  const source: IrrigationSource | null = /borewell|bore\s?well|tube\s?well/i.test(s)
    ? "borewell"
    : /canal/i.test(s)
      ? "canal"
      : /river/i.test(s)
        ? "river"
        : /tank/i.test(s)
          ? "tank"
          : /pond/i.test(s)
            ? "pond"
            : /lift/i.test(s)
              ? "lift"
              : /harvest/i.test(s)
                ? "rainwater_harvest"
                : null;

  const method: IrrigationMethod | null = /drip/i.test(s)
    ? "drip"
    : /rain\s?gun/i.test(s)
      ? "rain_gun"
      : /sprinkler/i.test(s)
        ? "sprinkler"
        : /furrow/i.test(s)
          ? "furrow"
          : /basin/i.test(s)
            ? "basin"
            : /hose/i.test(s)
              ? "manual_hose"
              : /flood/i.test(s)
                ? "flood"
                : null;

  return { regime: "irrigated", source, method };
}

export function efficiencyFor(method: IrrigationMethod | null | undefined): {
  value: number;
  assumed: boolean;
} {
  if (method && METHOD_EFFICIENCY[method] != null) {
    return { value: METHOD_EFFICIENCY[method], assumed: false };
  }
  return { value: 0.6, assumed: true };
}

export function dischargeFor(method: IrrigationMethod | null | undefined): number {
  return method ? METHOD_DISCHARGE_LPH_PER_ACRE[method] : 10000;
}
