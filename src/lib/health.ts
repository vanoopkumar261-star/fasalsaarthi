/**
 * Farm-health score.
 *
 * This replaces a version that only ever subtracted for *events* — heat, rain,
 * frost, a missed task. That version had one fatal property: a farm with no
 * event against it scored exactly 100, every day, for ever. A farmer whose
 * soil moisture was at 12% and whose pH was 4.8 saw a perfect score, because
 * nothing had "happened". A farm is not healthy because nothing has gone
 * wrong; it is healthy because its growing conditions are good.
 *
 * So the score is built in two parts, matching the website's health.ts:
 *
 *   CONDITIONS (the base) — six measured signals, each scored 0..1 against the
 *     crop actually standing in the field, then averaged by weight. This is
 *     what makes the number move on an ordinary day.
 *
 *   EVENTS (deductions) — the things worth acting on today, subtracted from
 *     that base and listed as explainable factors.
 *
 * A signal with no reading is not scored as bad, it is left out and the weights
 * are renormalised over whatever did report. A farmer with no pH reading and no
 * soil sensor still gets a fair score from weather alone, and `coverage` says
 * how much of the picture was actually measured.
 *
 * Weights, bands and the trapezoid are ported from the website unchanged, so
 * the phone and the dashboard cannot disagree about the same farm.
 */
import type { WeatherData } from "./weather";
import type { FarmWithCrop } from "./dashboard";
import { cropStageFor, getCropProfile, isRainFed } from "./agronomy";

export type HealthFactor = { label: string; delta: number };

/** The six measured growing conditions behind the base score. */
export type ConditionKey =
  | "temperature"
  | "moisture"
  | "humidity"
  | "wind"
  | "ph"
  | "water";

export type HealthCondition = {
  key: ConditionKey;
  /** The reading itself, or null when nothing reported. */
  value: number | null;
  unit: string;
  /** 0..1 against the crop in the field, or null when unmeasured. */
  score: number | null;
  /** Points this condition cost the base score. 0 when ideal or unmeasured. */
  delta: number;
  band: "good" | "watch" | "risk" | "unknown";
  label: string;
  /** Where the number came from, so the UI can say so. */
  source: "sensor" | "weather" | "reading" | "model" | null;
};

export type FarmHealth = {
  score: number; // 40..100
  band: "good" | "watch" | "risk";
  factors: HealthFactor[];
  conditions: HealthCondition[];
  /** Fraction of the six conditions that had a reading, 0..1. */
  coverage: number;
  note: string;
};

/** Readings the caller can supply, all optional. */
export type HealthSignals = {
  /** Field-sensor readings (ThingSpeak/ESP32), when a channel is configured. */
  sensors?: {
    temperature?: number | null;
    humidity?: number | null;
    soilMoisture?: number | null;
  } | null;
  /** Latest logged soil-pH reading for the holding. */
  soilPh?: number | null;
  /**
   * Root-zone water remaining as a percentage of available capacity, from the
   * irrigation engine (`IrrigationPlan.availablePct`). Averaged across plots by
   * the caller, since the score is for the holding.
   */
  availableWaterPct?: number | null;
};

/**
 * Trapezoid scoring: full marks inside [idealLo, idealHi], falling linearly to
 * zero at hardLo / hardHi.
 *
 * A step function would make the score jump a whole band when a reading moves
 * by 0.1 °C, which reads as instability rather than precision; a linear ramp
 * means a farm drifting towards trouble can be seen drifting.
 */
function bandScore(
  value: number,
  hardLo: number,
  idealLo: number,
  idealHi: number,
  hardHi: number
): number {
  if (value >= idealLo && value <= idealHi) return 1;
  if (value <= hardLo || value >= hardHi) return 0;
  return value < idealLo
    ? (value - hardLo) / (idealLo - hardLo)
    : (hardHi - value) / (hardHi - idealHi);
}

/**
 * Relative importance of each condition in the base score.
 *
 * Water and soil moisture lead because they are what actually kills a crop
 * inside a week; wind is last because except in a storm it mostly affects
 * spraying rather than the plant. Weights are renormalised over whichever
 * signals have readings, so a farm with no sensors is not punished for it.
 */
const WEIGHTS: Record<ConditionKey, number> = {
  water: 1.2,
  moisture: 1.2,
  temperature: 1.0,
  ph: 1.0,
  humidity: 0.8,
  wind: 0.6,
};

function conditionBand(score: number | null): HealthCondition["band"] {
  if (score === null) return "unknown";
  return score >= 0.8 ? "good" : score >= 0.5 ? "watch" : "risk";
}

export function computeFarmHealth({
  farms,
  weather,
  overdueTasks = 0,
  activeDiseases = 0,
  signals = {},
}: {
  farms: FarmWithCrop[];
  weather: WeatherData | null;
  /** Tasks generated yesterday that were never ticked. */
  overdueTasks?: number;
  /** Recent leaf scans that came back diseased. */
  activeDiseases?: number;
  /** Sensor, pH and irrigation readings. Absent ones are skipped, not penalised. */
  signals?: HealthSignals;
}): FarmHealth {
  const cropped = farms.filter((f) => f.crop);
  const factors: HealthFactor[] = [];

  if (cropped.length === 0) {
    return {
      score: 80,
      band: "watch",
      factors: [],
      conditions: [],
      coverage: 0,
      note: "No crops seeded yet — register a crop to start health tracking.",
    };
  }

  // The score is for the holding, so conditions are judged against the lead
  // crop; a per-plot score already exists on the crops page.
  const lead = cropped[0].crop!;
  const profile = getCropProfile(lead.chosen_crop);

  /* ── 1. Conditions: the base score ──────────────────────────────────────── */

  const conditions: HealthCondition[] = [];

  const add = (
    key: ConditionKey,
    value: number | null,
    unit: string,
    source: HealthCondition["source"],
    score: number | null,
    label: string
  ) => {
    conditions.push({
      key,
      value,
      unit,
      score,
      delta: 0, // filled in once the weights are normalised
      band: conditionBand(score),
      label,
      source,
    });
  };

  // Temperature — sensor first, since it is the air the crop is actually in.
  const temp = signals.sensors?.temperature ?? weather?.current.temp ?? null;
  if (temp !== null) {
    add(
      "temperature",
      temp,
      "°C",
      signals.sensors?.temperature != null ? "sensor" : "weather",
      // Ideal tops out well below the stress threshold: a wheat crop at 29 °C
      // is not suffering, but it is not in its best conditions either.
      bandScore(temp, 5, 20, Math.min(28, profile.heatThreshold - 5), profile.heatThreshold + 6),
      `${Math.round(temp)}°C air temperature for ${profile.displayName}`
    );
  } else {
    add("temperature", null, "°C", null, null, "No temperature reading yet");
  }

  // Soil moisture — only ever from hardware. There is no way to infer it.
  const sm = signals.sensors?.soilMoisture ?? null;
  if (sm !== null) {
    add(
      "moisture",
      sm,
      "%",
      "sensor",
      // Field capacity for most Indian field soils sits near 45-58%. Below 20%
      // the crop is in stress; above 85% the roots are drowning.
      bandScore(sm, 10, 45, 58, 92),
      `Soil moisture at ${Math.round(sm)}%`
    );
  } else {
    add("moisture", null, "%", null, null, "No soil-moisture sensor connected");
  }

  // Humidity — both ends matter: dry air drives transpiration past what the
  // roots can supply, and sustained high humidity is what fungal disease needs.
  const rh = signals.sensors?.humidity ?? weather?.current.humidity ?? null;
  if (rh !== null) {
    add(
      "humidity",
      rh,
      "%",
      signals.sensors?.humidity != null ? "sensor" : "weather",
      bandScore(rh, 10, 50, 65, 98),
      `Humidity at ${Math.round(rh)}%`
    );
  } else {
    add("humidity", null, "%", null, null, "No humidity reading yet");
  }

  // Wind — calm is ideal. Spraying becomes wasteful past ~15 km/h and lodging
  // risk starts around 35-40 km/h for a tall standing crop.
  const wind = weather?.current.windKph ?? null;
  if (wind !== null) {
    add("wind", wind, "km/h", "weather", bandScore(wind, -1, 0, 10, 45), `Wind at ${Math.round(wind)} km/h`);
  } else {
    add("wind", null, "km/h", null, null, "No wind reading yet");
  }

  // pH — judged against the crop standing in the field, not a generic range.
  const ph = signals.soilPh ?? null;
  if (ph !== null) {
    add(
      "ph",
      ph,
      "",
      "reading",
      // Full marks only in the middle 40% of the crop's range; the edges of
      // that range are tolerable, not optimal.
      bandScore(
        ph,
        profile.phMin - 1.5,
        profile.phMin + (profile.phMax - profile.phMin) * 0.3,
        profile.phMax - (profile.phMax - profile.phMin) * 0.3,
        profile.phMax + 1.5
      ),
      `Soil pH ${ph.toFixed(1)} for ${profile.displayName}`
    );
  } else {
    add("ph", null, "", null, null, "No soil-pH reading saved");
  }

  // Root-zone water. Paddy is excluded: it is grown ponded, so "available
  // water" is not the quantity that describes it and would read as waterlogged.
  const awp = signals.availableWaterPct ?? null;
  if (awp !== null && !profile.water.ponded) {
    add(
      "water",
      awp,
      "%",
      "model",
      // Below the crop's depletion trigger it is already losing yield, so that
      // is the zero end. Full marks only in the top fifth of the reservoir —
      // between the two the crop is drawing down and the farmer should know.
      bandScore(awp, (1 - profile.water.depletionFraction) * 100, 80, 100, 101),
      `Root-zone water at ${Math.round(awp)}% of capacity`
    );
  } else {
    add("water", null, "%", null, null, "Root-zone water not modelled yet");
  }

  // Weighted mean over the signals that actually reported.
  const measured = conditions.filter((c) => c.score !== null);
  const totalWeight = measured.reduce((s, c) => s + WEIGHTS[c.key], 0);
  const coverage = measured.length / conditions.length;

  let base: number;
  if (totalWeight === 0) {
    // Nothing measurable at all — a brand-new account before the first weather
    // fetch. Assert nothing: a neutral base, and the UI says why.
    base = 85;
    factors.push({ label: "Weather data syncing", delta: 0 });
  } else {
    const mean = measured.reduce((s, c) => s + c.score! * WEIGHTS[c.key], 0) / totalWeight;
    base = mean * 100;
    // Attribute the shortfall back to each condition, so the panel adds up.
    for (const c of measured) {
      c.delta = -Math.round((1 - c.score!) * (WEIGHTS[c.key] / totalWeight) * 100);
    }
  }

  /* ── 2. Events: deductions for things to act on ─────────────────────────── */

  let score = base;

  if (weather) {
    // Heat stress at a sensitive stage, per crop. Counted once however many
    // plots qualify — it is one weather system over one holding.
    let heatHit = false;
    for (const f of cropped) {
      const p = getCropProfile(f.crop!.chosen_crop);
      const st = cropStageFor(f.crop!.chosen_crop, f.crop!.seeding_date, f.crop!.estimated_harvest_date);
      const sensitive = st.label === "Flowering" || st.label === "Vegetative";
      if (sensitive && weather.current.temp >= p.heatThreshold && !heatHit) {
        score -= 12;
        factors.push({
          label: `Heat stress risk — ${f.crop!.chosen_crop} at ${st.label.toLowerCase()}`,
          delta: -12,
        });
        heatHit = true;
      }
    }

    // Rain in the next 3 days — worse if a crop is maturing (harvest/spoilage risk).
    const rainSoon = weather.daily.slice(0, 3).some((d) => d.precipProb >= 50);
    if (rainSoon) {
      const maturing = cropped.some(
        (f) =>
          cropStageFor(f.crop!.chosen_crop, f.crop!.seeding_date, f.crop!.estimated_harvest_date)
            .label === "Maturity"
      );
      if (maturing) {
        score -= 10;
        factors.push({ label: "Rain forecast during a harvest window", delta: -10 });
      } else {
        score -= 3;
        factors.push({ label: "Rain forecast — field operations constrained", delta: -3 });
      }
    }

    // Frost / cold snap.
    const frost = weather.daily.slice(0, 3).some((d) => d.tMin <= 4);
    if (frost) {
      score -= 8;
      factors.push({ label: "Cold/frost risk in the forecast", delta: -8 });
    }

    // Water risk: a thirsty crop on a rain-fed plot with no rain coming has no
    // fallback, which is a materially different position from the same crop on
    // a borewell. Only counted once, however many plots qualify.
    const noRainAhead = !weather.daily.slice(0, 3).some((d) => d.precipProb >= 40);
    const thirstyRainFed = cropped.find((f) => {
      const p = getCropProfile(f.crop!.chosen_crop);
      const st = cropStageFor(f.crop!.chosen_crop, f.crop!.seeding_date, f.crop!.estimated_harvest_date);
      const growing = st.label === "Vegetative" || st.label === "Flowering";
      return p.waterHeavy && growing && isRainFed(f.irrigation);
    });
    if (noRainAhead && thirstyRainFed) {
      score -= 7;
      factors.push({
        label: `No rain forecast — ${thirstyRainFed.crop!.chosen_crop} is rain-fed and thirsty`,
        delta: -7,
      });
    }
  }

  // Unresolved disease is the most direct evidence we have of poor health, so
  // it outweighs any single weather signal.
  if (activeDiseases > 0) {
    const d = Math.min(20, activeDiseases * 10);
    score -= d;
    factors.push({
      label: `${activeDiseases} recent scan${activeDiseases > 1 ? "s" : ""} found disease`,
      delta: -d,
    });
  }

  if (overdueTasks > 0) {
    const d = Math.min(15, overdueTasks * 3);
    score -= d;
    factors.push({
      label: `${overdueTasks} task${overdueTasks > 1 ? "s" : ""} missed yesterday`,
      delta: -d,
    });
  }

  // Nothing wrong is itself worth saying — otherwise a clean run of events
  // looks like the feature simply failed to produce any.
  if (factors.length === 0) {
    factors.push({ label: "No heat, rain, frost or disease risk detected", delta: 0 });
  }

  score = Math.max(40, Math.min(100, Math.round(score)));
  const band = score >= 78 ? "good" : score >= 60 ? "watch" : "risk";
  const note =
    band === "good"
      ? "Your farms are in great shape."
      : band === "watch"
        ? "Healthy, with a few items to watch."
        : "Needs attention — check alerts.";

  return { score, band, factors, conditions, coverage, note };
}
