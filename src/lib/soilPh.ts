/**
 * Soil-pH interpretation — a pure function shared by the dashboard card, the
 * scanner confirm step, the history table, and the server-side AI context.
 *
 * Bands are tuned for Indian field crops: most (wheat, paddy, cotton, pulses,
 * oilseeds) do best from about 6.0 to 7.5. `labelEn`/`adviceEn` are for the
 * server contexts (assistant memory, crop-rec prompt); client components render
 * `t(\`soilPh.band.\${key}.label\`)` / `.advice` instead.
 */

export type PhBandKey =
  | "veryAcidic"
  | "acidic"
  | "slightlyAcidic"
  | "neutral"
  | "slightlyAlkaline"
  | "alkaline";

export type PhBand = {
  key: PhBandKey;
  labelEn: string;
  adviceEn: string;
  /** Hue for the slider / pill tint. */
  color: string;
};

const BANDS: { max: number; band: PhBand }[] = [
  {
    max: 5.0,
    band: {
      key: "veryAcidic",
      labelEn: "Very acidic",
      adviceEn:
        "Strongly acidic — most crops will struggle. Apply agricultural lime and re-test after a few weeks; a soil-testing lab visit is worthwhile.",
      color: "#C2410C",
    },
  },
  {
    max: 6.0,
    band: {
      key: "acidic",
      labelEn: "Acidic",
      adviceEn:
        "Acidic — fine for tea, potato and some pulses, but lime the field before wheat, cotton or vegetables.",
      color: "#D97706",
    },
  },
  {
    max: 6.8,
    band: {
      key: "slightlyAcidic",
      labelEn: "Slightly acidic",
      adviceEn:
        "In the ideal range for most Indian field crops. No correction needed — keep adding organic matter.",
      color: "#4E6B3D",
    },
  },
  {
    max: 7.5,
    band: {
      key: "neutral",
      labelEn: "Neutral",
      adviceEn:
        "Neutral soil — good for nearly every crop and for nutrient availability. Nothing to correct.",
      color: "#3F7A2E",
    },
  },
  {
    max: 8.3,
    band: {
      key: "slightlyAlkaline",
      labelEn: "Slightly alkaline",
      adviceEn:
        "Slightly alkaline — iron and zinc can lock up. Add gypsum or press mud and use compost; watch for yellowing leaves.",
      color: "#0369A1",
    },
  },
  {
    max: Infinity,
    band: {
      key: "alkaline",
      labelEn: "Alkaline",
      adviceEn:
        "Strongly alkaline / possibly saline-sodic. Apply gypsum, grow tolerant crops (barley, mustard, dhaincha) and get a full soil test before investing in inputs.",
      color: "#075985",
    },
  },
];

export function phBand(ph: number): PhBand {
  const clamped = Math.min(14, Math.max(0, ph));
  return (BANDS.find((b) => clamped < b.max) ?? BANDS[BANDS.length - 1]).band;
}
