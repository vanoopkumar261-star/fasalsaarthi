import { getCropProfile, type CropStageInfo } from "./agronomy";

/**
 * What to do about a soil-pH reading, for the crop that is already growing.
 *
 * ── The question this replaces ───────────────────────────────────────────────
 * The soil page used to answer "which crops would suit this pH". That is the
 * wrong question for the person asking it. A farmer ninety days into a wheat
 * crop cannot switch to something that likes acid soil; they need to know what
 * to do about the field they are standing in.
 *
 * ── Why the answer is split in two ───────────────────────────────────────────
 * Lime and gypsum take months to move soil pH — they have to dissolve and react
 * through the root zone. So while a crop is standing, the honest answer is that
 * the soil itself cannot be corrected this season, and pretending otherwise
 * sells a farmer a sack of lime that will do nothing for the crop they are
 * worried about.
 *
 * What CAN be done mid-season is different in kind: pH does not starve a plant
 * directly, it locks nutrients up, so the in-season fix is to bypass the soil —
 * feed the leaf, and pick a fertiliser that pushes pH the right way instead of
 * the wrong one. Hence two lists:
 *
 *   now          — works while the crop stands
 *   afterHarvest — the real correction, once the field is clear
 *
 * With no crop in the ground there is nothing to work around, so the amendment
 * IS the immediate advice and `afterHarvest` stays empty.
 *
 * ── Why actions are keys, not sentences ──────────────────────────────────────
 * Every line here is rendered in nine languages. Returning `{ key, params }`
 * means a dozen translated strings with numbers substituted in, rather than a
 * separate paragraph for every combination of pH band, crop and growth stage —
 * which would have been hundreds.
 */

export type PhStatus = "ok" | "tooAcidic" | "tooAlkaline";

/** An i18n key plus the numbers to substitute. Never a built sentence. */
export type SoilAction = {
  key: string;
  params?: Record<string, string | number>;
};

export type SoilFix = {
  status: PhStatus;
  /** The crop's own comfortable band, for display. */
  phMin: number;
  phMax: number;
  cropLabel: string;
  /** How far outside the band, in pH units. 0 when inside. */
  gap: number;
  /** True when a crop is standing, which is what forces the two-list split. */
  cropStanding: boolean;
  now: SoilAction[];
  afterHarvest: SoilAction[];
};

/**
 * Amendment rate per pH unit of correction, in kg/acre, by soil texture.
 *
 * A sandy soil has little to resist a pH change; a clay holds far more
 * exchangeable acidity and needs roughly three times as much to shift the same
 * distance. These sit in the middle of standard Indian extension guidance
 * (around 2–4 t/ha, i.e. ~325–650 kg/acre, per pH unit on a loam).
 *
 * They are a starting figure for a farmer with no lab report, not a
 * prescription — which is why every caller shows the soil-test caveat beside
 * them. Never present these as exact.
 */
const RATE_PER_PH_UNIT: { match: RegExp; lime: number; gypsum: number }[] = [
  { match: /sand|light|loamy sand/i, lime: 200, gypsum: 200 },
  { match: /clay|heavy|black|regur/i, lime: 600, gypsum: 500 },
  // Loam, silt, red, alluvial and anything unrecognised land here.
  { match: /./, lime: 400, gypsum: 350 },
];

/** Rounded to something a farmer can actually buy — 25 kg bags. */
function dose(perUnit: number, gap: number): number {
  const raw = perUnit * Math.max(0.5, Math.min(gap, 2.5));
  return Math.round(raw / 25) * 25;
}

function ratesFor(soilType: string) {
  return RATE_PER_PH_UNIT.find((r) => r.match.test(soilType ?? "")) ?? RATE_PER_PH_UNIT[2];
}

export function soilFix(input: {
  ph: number;
  /** `chosen_crop` from the farm's cycle. Empty or absent means fallow. */
  crop?: string | null;
  soilType: string;
  /** From `cropStageFor()`. Absent when no crop is growing. */
  stage?: CropStageInfo | null;
}): SoilFix {
  const { ph, crop, soilType, stage } = input;
  const profile = getCropProfile(crop || "");
  const { phMin, phMax } = profile;
  const cropStanding = Boolean(crop && stage);

  const status: PhStatus = ph < phMin ? "tooAcidic" : ph > phMax ? "tooAlkaline" : "ok";
  const gap = status === "tooAcidic" ? phMin - ph : status === "tooAlkaline" ? ph - phMax : 0;

  const base = {
    status,
    phMin,
    phMax,
    cropLabel: profile.displayName,
    gap: Number(gap.toFixed(1)),
    cropStanding,
  };

  // Nothing wrong. Say so and stop — inventing a problem to fill the panel is
  // how a farmer ends up spending money on lime they did not need.
  if (status === "ok") {
    return {
      ...base,
      now: [{ key: "soilFix.action.inRange", params: { crop: profile.displayName } }],
      afterHarvest: [],
    };
  }

  const rates = ratesFor(soilType);
  const severe = gap >= 1.0;

  // The soil correction itself. Slow, so its placement depends on the crop.
  const amendment: SoilAction[] =
    status === "tooAcidic"
      ? [
          { key: "soilFix.action.lime", params: { kg: dose(rates.lime, gap) } },
          { key: "soilFix.action.organicMatter" },
          ...(severe ? [{ key: "soilFix.action.labTest" }] : []),
          { key: "soilFix.action.retest" },
        ]
      : [
          { key: "soilFix.action.gypsum", params: { kg: dose(rates.gypsum, gap) } },
          { key: "soilFix.action.pressMud" },
          ...(severe ? [{ key: "soilFix.action.labTest" }] : []),
          { key: "soilFix.action.retest" },
        ];

  // What actually works while the crop is in the ground: feed the leaf, and
  // choose a fertiliser that nudges pH the right way rather than the wrong one.
  const inSeason: SoilAction[] =
    status === "tooAcidic"
      ? [
          { key: "soilFix.action.acidLockout" },
          { key: "soilFix.action.useCAN" },
          { key: "soilFix.action.foliarPhosphorus" },
        ]
      : [
          { key: "soilFix.action.alkaliLockout" },
          { key: "soilFix.action.foliarZincIron" },
          { key: "soilFix.action.useAmmoniumSulphate" },
        ];

  if (!cropStanding) {
    // Fallow: the amendment is the immediate advice, and it has time to work
    // before the next sowing.
    return { ...base, now: amendment, afterHarvest: [] };
  }

  return { ...base, now: inSeason, afterHarvest: amendment };
}
