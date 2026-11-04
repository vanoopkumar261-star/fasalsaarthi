/**
 * The irrigation engine — how much water this field needs, when, and why.
 *
 * Pure and isomorphic: no DB, no `next/headers`, no fetch. Same contract as
 * `agronomy.ts`, so the dashboard can call it on the server and a client
 * component can recompute from the same inputs without a round trip.
 *
 * ── What this computes ───────────────────────────────────────────────────────
 * A FAO-56 soil water balance. The field is treated as a reservoir the crop
 * draws down and rain or irrigation refills:
 *
 *     TAW  = AWC × rootDepth        total available water in the root zone, mm
 *     RAW  = p × TAW                 readily available — the refill trigger
 *     ETc  = ET₀ × Kc(stage)         what the crop takes out today, mm
 *     Peff = effective rainfall      what the sky puts back, mm
 *     Dr   = Dr₋₁ − Peff − Irrig + ETc        depletion, clamped to 0..TAW
 *
 * When `Dr` reaches `RAW` the crop is about to start losing yield, so that is
 * when to irrigate — and the amount is `Dr` itself, because refilling past
 * field capacity just drains below the roots.
 *
 * ── Why physics and not a model ──────────────────────────────────────────────
 * Every number here can be traced to a measured input: Open-Meteo's
 * Penman-Monteith ET₀, the crop's Kc from FAO-56, the soil's water-holding
 * capacity, the method's application efficiency. That matters more than
 * sophistication — a farmer who is told to run a pump for three hours deserves
 * an answer that can be checked, and an LLM asked to produce millimetres will
 * produce plausible ones whether or not they are right. The language model in
 * this feature writes sentences about these numbers; it never produces them.
 *
 * ── Honesty about inputs ─────────────────────────────────────────────────────
 * The weakest link is where the balance STARTS. Without a season of history we
 * do not know today's depletion, so `source` on the result always says which of
 * three footings was used — a live sensor, modelled from the last known wetting
 * event, or a mid-range assumption. The UI shows it. See `npk.ts` for the same
 * convention applied to un-measured nutrient levels.
 */

import {
  cropStageFor,
  getCropProfile,
  kcAt,
  rootDepthAt,
  type CropProfile,
  type CropStageInfo,
  type StageLabel,
} from "./agronomy";
import type { WeatherData } from "./weather";
import {
  composeIrrigationLabel,
  dischargeFor,
  efficiencyFor,
  isIrrigationMethod,
  isIrrigationSource,
  isWaterRegime,
  mmToLitres,
  parseLegacyIrrigation,
  type IrrigationMethod,
  type IrrigationSource,
  type WaterRegime,
} from "./irrigationCatalog";

/* ────────────────────────────── soil ────────────────────────────────────── */

/**
 * Available water capacity by soil texture, mm of water per metre of depth.
 *
 * Keyed by regex against the farm's free-text soil type, exactly like
 * `RATE_PER_PH_UNIT` in `soilFix.ts` — the farm stores one of five Indian soil
 * names, but the column has never had a constraint, so anything may be in it
 * and an unrecognised value must still produce sensible advice.
 *
 * A sandy soil holds very little and must be watered little and often; a black
 * cotton soil holds three times as much and can go a week longer between
 * irrigations on the same crop. This single number is what makes the schedule
 * differ between two neighbours growing identical crops.
 *
 * Mid-range figures from ICAR soil-survey texture classes. Like the pH
 * amendment rates, they are a starting point for a farm with no lab report and
 * every caller shows that caveat.
 */
const AWC_MM_PER_M: { match: RegExp; awc: number; note: string }[] = [
  { match: /sand|light|loamy sand/i, awc: 90, note: "sandy — drains fast, water little and often" },
  { match: /clay|heavy|black|regur|vertisol/i, awc: 190, note: "clay-rich — holds water well" },
  { match: /red|laterite|gravel/i, awc: 110, note: "red/lateritic — moderate holding capacity" },
  { match: /./, awc: 150, note: "loam/alluvial — balanced holding capacity" },
];

export function soilWaterCapacity(soilType: string | null | undefined): {
  awc: number;
  note: string;
} {
  const hit = AWC_MM_PER_M.find((r) => r.match.test(soilType ?? "")) ?? AWC_MM_PER_M[3];
  return { awc: hit.awc, note: hit.note };
}

/* ────────────────────────────── types ───────────────────────────────────── */

export type IrrigationEvent = {
  id?: string;
  farm_id?: string | null;
  applied_at: string;
  depth_mm?: number | null;
  volume_litres?: number | null;
  duration_minutes?: number | null;
  source?: string | null;
  cost_rupees?: number | null;
  note?: string | null;
};

export type IrrigationFarmLike = {
  id?: string;
  farm_index: number;
  area: number;
  soil_type: string;
  /** Legacy free-text label; still the fallback when the split columns are null. */
  irrigation: string;
  water_regime?: string | null;
  irrigation_source?: string | null;
  irrigation_method?: string | null;
};

export type IrrigationCropLike = {
  chosen_crop: string;
  seeding_date: string;
  estimated_harvest_date?: string | null;
};

/** One modelled day of the water balance. */
export type BalanceDay = {
  dateISO: string;
  weekday: string;
  /** Root-zone depletion at end of day, mm. 0 = field capacity. */
  depletionMm: number;
  /** Soil water remaining as a percentage of total available water. */
  availablePct: number;
  taw: number;
  raw: number;
  etc: number;
  rainMm: number;
  /** Irrigation applied on this day by the plan, net mm. */
  irrigationMm: number;
};

export type ScheduleEntry = {
  dateISO: string;
  weekday: string;
  /** Net depth the crop needs, mm. */
  netMm: number;
  /** What must actually be applied once losses are counted, mm. */
  grossMm: number;
  volumeLitres: number;
  runMinutes: number;
  reason: string;
};

export type WaterFactor = { label: string; delta?: number };

export type IrrigationStatus = "optimal" | "deficit" | "critical" | "over_irrigated";

export type IrrigationVerdict =
  | "irrigate_today"
  | "hold"
  | "rain_coming"
  | "no_crop"
  | "no_data";

/**
 * Where the starting depletion came from. Mirrors the provenance flags the
 * dry-run harness already asserts on elsewhere (`isRealData`, `configured`,
 * `source`), so an irrigation probe can check it the same way.
 */
export type BalanceSource = "sensor" | "modelled" | "assumed";

export type IrrigationPlan = {
  farmIndex: number;
  farmId?: string;
  areaAcres: number;
  regime: WaterRegime;
  source: IrrigationSource | null;
  method: IrrigationMethod | null;
  irrigationLabel: string;

  cropName: string | null;
  stage: CropStageInfo | null;

  verdict: IrrigationVerdict;
  status: IrrigationStatus;

  /** Net water the crop needs today, mm. */
  needMm: number;
  /** What to apply today after efficiency losses, mm. */
  grossMm: number;
  volumeLitres: number;
  runMinutes: number;

  /** Soil water remaining right now, as a percentage of available capacity. */
  availablePct: number;
  taw: number;
  raw: number;
  /**
   * The depletion this system actually irrigates at. Equals `raw` for surface
   * methods; lower for drip, which runs little and often. This is the line the
   * forecast chart should draw, not `raw`.
   */
  triggerMm: number;
  /** Today's crop water use, mm. */
  etcToday: number;

  factors: WaterFactor[];
  forecast: BalanceDay[];
  schedule: ScheduleEntry[];
  savings: {
    litresSaved: number;
    percentSaved: number;
    vsBaseline: string;
    provenance: string;
  } | null;

  balanceSource: BalanceSource;
  /** True when the method is unknown and a conservative efficiency was assumed. */
  efficiencyAssumed: boolean;
  efficiency: number;
  soilNote: string;
  ponded: boolean;
};

/* ───────────────────────────── helpers ──────────────────────────────────── */

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Effective rainfall — the share of a day's rain that actually enters the root
 * zone rather than running off or evaporating from the surface.
 *
 * The USDA-SCS short form. The −2 mm matters more than it looks: it is why a
 * day of 1.5 mm drizzle correctly contributes nothing, instead of letting a
 * week of trace readings quietly cancel a real irrigation.
 */
function effectiveRain(rainMm: number): number {
  return Math.max(0, 0.8 * rainMm - 2);
}

/**
 * Depletion fraction adjusted for how much this stage can tolerate.
 *
 * FAO-56 allows p to shift with demand; the practical point for a farmer is
 * that flowering is the stage where water stress costs the most yield and is
 * least recoverable. Tightening p there makes the schedule refill sooner —
 * deliberately conservative at the one moment it pays to be.
 */
function depletionFractionFor(profile: CropProfile, stage: StageLabel): number {
  const base = profile.water.depletionFraction;
  if (stage === "Flowering") return Math.max(0.2, base - 0.1);
  if (stage === "Maturity") return Math.min(0.8, base + 0.1);
  return base;
}

/** Resolve the farm's water setup, preferring the split columns over the legacy label. */
export function resolveIrrigationSetup(farm: IrrigationFarmLike): {
  regime: WaterRegime;
  source: IrrigationSource | null;
  method: IrrigationMethod | null;
} {
  const regime = isWaterRegime(farm.water_regime) ? farm.water_regime : null;
  const source = isIrrigationSource(farm.irrigation_source) ? farm.irrigation_source : null;
  const method = isIrrigationMethod(farm.irrigation_method) ? farm.irrigation_method : null;
  if (regime) return { regime, source, method };
  // Pre-029 row, or one written by an older client.
  const legacy = parseLegacyIrrigation(farm.irrigation);
  return { regime: legacy.regime, source: source ?? legacy.source, method: method ?? legacy.method };
}

function daysBetween(fromISO: string, toMs: number): number {
  const t = new Date(fromISO).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((toMs - t) / 86_400_000));
}

/**
 * Where the water balance starts today, and how much to trust it.
 *
 * Three footings in descending order of honesty:
 *
 *   sensor   — a live soil-moisture reading, mapped across the plant-available
 *              band. Best available, though a capacitive probe reports relative
 *              moisture rather than calibrated depletion, so this is still an
 *              approximation and the UI says which probe it came from.
 *   modelled — no sensor, but we know when the field was last wetted, so the
 *              crop's demand is accumulated forward from there.
 *   assumed  — neither. Starts at half of readily-available water: the middle
 *              of the range, chosen so the first recommendation is cautious
 *              rather than confidently wrong in either direction.
 */
function startingDepletion(input: {
  taw: number;
  raw: number;
  etcToday: number;
  sensorMoisturePct?: number | null;
  recentEvents: IrrigationEvent[];
  weather: WeatherData | null;
}): { dr: number; source: BalanceSource } {
  const { taw, raw, etcToday, sensorMoisturePct, recentEvents, weather } = input;

  if (typeof sensorMoisturePct === "number" && Number.isFinite(sensorMoisturePct)) {
    const pct = Math.max(0, Math.min(100, sensorMoisturePct));
    return { dr: round1(taw * (1 - pct / 100)), source: "sensor" };
  }

  const now = Date.now();
  const lastEvent = recentEvents
    .filter((e) => e.applied_at)
    .sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime())[0];

  if (lastEvent) {
    const days = daysBetween(lastEvent.applied_at, now);
    if (Number.isFinite(days) && days <= 30) {
      // Rain since the event is unknown without historical weather, so today's
      // forecast rain is the only correction available. Deliberately not
      // back-filled with guesses.
      const used = etcToday * days;
      const rainToday = weather?.daily?.[0]?.rainMm ?? 0;
      return { dr: round1(Math.max(0, Math.min(taw, used - effectiveRain(rainToday)))), source: "modelled" };
    }
  }

  return { dr: round1(raw * 0.5), source: "assumed" };
}

/* ─────────────────────────── the main entry ─────────────────────────────── */

export function computeIrrigationPlan(input: {
  farm: IrrigationFarmLike;
  crop: IrrigationCropLike | null;
  weather: WeatherData | null;
  sensorMoisturePct?: number | null;
  recentEvents?: IrrigationEvent[];
}): IrrigationPlan {
  const { farm, crop, weather } = input;
  const recentEvents = input.recentEvents ?? [];
  const setup = resolveIrrigationSetup(farm);
  const eff = efficiencyFor(setup.method);
  const irrigationLabel = composeIrrigationLabel(setup.regime, setup.source, setup.method);
  const soil = soilWaterCapacity(farm.soil_type);

  const base = {
    farmIndex: farm.farm_index,
    farmId: farm.id,
    areaAcres: farm.area,
    regime: setup.regime,
    source: setup.source,
    method: setup.method,
    irrigationLabel,
    efficiency: eff.value,
    efficiencyAssumed: eff.assumed,
    soilNote: soil.note,
  };

  const empty = {
    needMm: 0,
    grossMm: 0,
    volumeLitres: 0,
    runMinutes: 0,
    availablePct: 100,
    taw: 0,
    raw: 0,
    triggerMm: 0,
    etcToday: 0,
    forecast: [] as BalanceDay[],
    schedule: [] as ScheduleEntry[],
    savings: null,
    ponded: false,
  };

  // Nothing growing — say so plainly rather than inventing a requirement for a
  // bare field. Same convention as `soilFix()` returning "in range" and
  // stopping instead of filling the panel with a problem.
  if (!crop) {
    return {
      ...base,
      ...empty,
      cropName: null,
      stage: null,
      verdict: "no_crop",
      status: "optimal",
      balanceSource: "assumed",
      factors: [{ label: "No crop is sown on this farm yet", delta: 0 }],
    };
  }

  const profile = getCropProfile(crop.chosen_crop);
  const stage = cropStageFor(crop.chosen_crop, crop.seeding_date, crop.estimated_harvest_date);
  const ponded = profile.water.ponded === true && setup.regime === "irrigated";

  // Weather is the engine's fuel. Without it there is no honest number to give,
  // so the plan degrades to a stated gap rather than a fabricated schedule —
  // mirroring the "Weather data syncing" factor in `health.ts`.
  if (!weather || !weather.daily?.length) {
    return {
      ...base,
      ...empty,
      cropName: profile.displayName,
      stage,
      verdict: "no_data",
      status: "optimal",
      balanceSource: "assumed",
      factors: [{ label: "Weather data syncing — water need unavailable", delta: 0 }],
    };
  }

  const days = weather.daily.slice(0, 7);
  const factors: WaterFactor[] = [];

  /* ── reservoir size ───────────────────────────────────────────────────── */

  const rootDepth = rootDepthAt(profile, stage.progress);
  const p = depletionFractionFor(profile, stage.label);

  // Paddy is a different problem: the target is a shallow standing layer, not a
  // moist root zone. Modelling it as depletion would advise letting a puddled
  // field dry down, which is wrong, so the reservoir becomes the ponding band
  // and percolation is added to daily loss.
  const PADDY_POND_MM = 50;
  const PADDY_REFILL_MM = 30;
  const PADDY_PERCOLATION_MM_DAY = 3;

  const taw = ponded ? PADDY_POND_MM : round1(soil.awc * rootDepth);
  const raw = ponded ? PADDY_REFILL_MM : round1(taw * p);

  const kcToday = kcAt(profile, stage.progress);
  const et0Today = days[0]?.et0 ?? 0;
  const etcToday = round1(et0Today * kcToday + (ponded ? PADDY_PERCOLATION_MM_DAY : 0));

  /**
   * The depletion at which this system actually irrigates.
   *
   * Surface methods refill the root zone when it reaches RAW — one big
   * application, days apart. Drip does not work that way and must not be
   * scheduled that way: emitters wet a small volume of soil at 1–2 mm/hour, so
   * telling a farmer to replace 50 mm in one go means a 50-hour run. Real drip
   * is managed at high frequency — a short dose every day or two, roughly
   * replacing what the crop used.
   *
   * That frequency is also *why* drip saves water: little and often keeps the
   * wetted zone near field capacity without ever pushing water below the roots.
   * Scheduling it like flood would hand back the efficiency the farmer paid
   * for, and produce a run time nobody would follow.
   */
  // A hose joins drip here for a different reason: nobody hand-waters acres to
  // full root-zone depth in one pass. Both are managed as frequent small doses.
  const HIGH_FREQUENCY: IrrigationMethod[] = ["drip", "manual_hose"];
  const highFrequency = setup.method ? HIGH_FREQUENCY.includes(setup.method) : false;
  const triggerMm = ponded
    ? raw
    : highFrequency
      ? round1(Math.min(raw, Math.max(etcToday * 2, taw * 0.15)))
      : raw;

  /**
   * The most one run should apply. Unbounded for surface methods, which refill
   * the root zone in a single pass by design; for drip it is one top-up, so a
   * field that has dried past that is caught up over the following days rather
   * than in one impractical run.
   */
  const maxDoseMm = highFrequency ? Math.max(triggerMm, etcToday * 2) : Number.POSITIVE_INFINITY;

  /* ── starting point ───────────────────────────────────────────────────── */

  const start = startingDepletion({
    taw,
    raw,
    etcToday,
    sensorMoisturePct: input.sensorMoisturePct,
    recentEvents,
    weather,
  });

  /* ── forward run ──────────────────────────────────────────────────────── */

  const forecast: BalanceDay[] = [];
  const schedule: ScheduleEntry[] = [];
  const discharge = dischargeFor(setup.method);
  const canIrrigate = setup.regime === "irrigated";

  let dr = start.dr;
  /** Net mm of pumping the forecast let us skip. */
  let rainDeferredMm = 0;

  days.forEach((d, i) => {
    // Kc moves through the week as the crop ages — small, but it is the
    // difference between a schedule that drifts correctly and one that is flat.
    const progress = Math.min(1, stage.progress + i / Math.max(1, stage.cycleDays));
    const kc = kcAt(profile, progress);
    const etc = round1(d.et0 * kc + (ponded ? PADDY_PERCOLATION_MM_DAY : 0));
    const peff = effectiveRain(d.rainMm);

    dr = dr + etc - peff;

    let applied = 0;
    if (canIrrigate && dr >= triggerMm) {
      // Rain within the next two days that would do the job on its own means
      // pumping today is wasted — this is the "adapts to rainfall forecasts"
      // behaviour, and it is also where most of the water saving comes from.
      const rainAhead = days
        .slice(i + 1, i + 3)
        .reduce((sum, nd) => sum + effectiveRain(nd.rainMm), 0);

      if (rainAhead >= dr * 0.8) {
        // Let the sky pay for it. Recorded because this — not under-watering —
        // is where the water saving genuinely comes from, and a saving we
        // cannot point at is a saving we should not claim.
        rainDeferredMm += dr;
      } else {
        // A high-frequency system tops up rather than refilling. Capping the
        // dose keeps each run to a length a farmer will actually sit through,
        // and a field that has dried further than one dose can fix simply gets
        // watered again tomorrow — which is how drip recovers in practice.
        applied = Math.max(0, Math.min(dr, maxDoseMm));
        const grossMm = round1(applied / eff.value);
        const volumeLitres = Math.round(mmToLitres(grossMm, farm.area));
        schedule.push({
          dateISO: d.dateISO,
          weekday: d.weekday,
          netMm: round1(applied),
          grossMm,
          volumeLitres,
          runMinutes: Math.round((volumeLitres / Math.max(1, discharge * farm.area)) * 60),
          reason: highFrequency
            ? `Daily top-up — drip replaces what ${profile.displayName} used rather than refilling the whole root zone`
            : i === 0
              ? `Soil water is down to the refill point for ${profile.displayName} at ${stage.label.toLowerCase()}`
              : `Projected to reach the refill point on this day`,
        });
        // Subtract what was applied rather than zeroing: a capped drip dose
        // does not restore the field to capacity, and pretending it did would
        // hide the remaining deficit from both the chart and tomorrow's advice.
        dr = Math.max(0, dr - applied);
      }
    }

    dr = Math.max(0, Math.min(taw, dr));

    forecast.push({
      dateISO: d.dateISO,
      weekday: d.weekday,
      depletionMm: round1(dr),
      availablePct: Math.round(((taw - dr) / Math.max(1, taw)) * 100),
      taw,
      raw,
      etc,
      rainMm: d.rainMm,
      irrigationMm: round1(applied),
    });
  });

  /* ── today's answer ───────────────────────────────────────────────────── */

  const todayEntry = schedule.find((s) => s.dateISO === days[0].dateISO);
  const drToday = forecast[0]?.depletionMm ?? start.dr;
  const rainNext3 = days.slice(0, 3).reduce((s, d) => s + d.rainMm, 0);

  let verdict: IrrigationVerdict;
  if (!canIrrigate) {
    verdict = "hold";
  } else if (todayEntry) {
    verdict = "irrigate_today";
  } else if (rainNext3 >= 5 && start.dr >= raw * 0.7) {
    verdict = "rain_coming";
  } else {
    verdict = "hold";
  }

  // Status describes the field; verdict describes the action. They are separate
  // because a rain-fed plot can be in deficit with no action available.
  const recentOver = recentEvents.some((e) => {
    const days_ = daysBetween(e.applied_at, Date.now());
    return days_ <= 2 && (e.depth_mm ?? 0) > taw * 1.2;
  });

  let status: IrrigationStatus;
  if (recentOver || (start.dr <= 1 && rainNext3 >= 20)) {
    status = "over_irrigated";
  } else if (start.dr >= taw * 0.9) {
    status = "critical";
  } else if (start.dr >= raw) {
    status = "deficit";
  } else {
    status = "optimal";
  }

  /* ── explainable factors ──────────────────────────────────────────────── */

  factors.push({
    label: `${profile.displayName} at ${stage.label.toLowerCase()} uses about ${etcToday} mm a day right now`,
  });
  factors.push({
    label: `${farm.soil_type || "This soil"} holds ~${taw} mm across a ${round1(rootDepth)} m root zone (${soil.note})`,
  });

  if (stage.label === "Flowering") {
    factors.push({
      // Two sentences and "biggest loss of yield" rather than an em-dash clause
      // and "costs the most yield". Both were chosen by round-tripping the
      // Hindi back to English: the old wording came back as water stress having
      // "the greatest impact on production", which a farmer could read either
      // way, and a tested variant turned the bare fragment "Flowering." into
      // "flowing". This is the one factor that argues for *more* water, so it
      // is the one that must not come out ambiguous.
      label:
        "Flowering. Water stress now causes the biggest loss of yield, so the refill point is tightened.",
      delta: -1,
    });
  }
  if (rainNext3 >= 5) {
    factors.push({ label: `${round1(rainNext3)} mm of rain expected in the next 3 days`, delta: 1 });
  }
  if (ponded) {
    factors.push({ label: "Grown under standing water — topped up to keep the pond, not to a soil-moisture target" });
  }
  if (highFrequency) {
    factors.push({
      label: `${setup.method === "drip" ? "Drip" : "Hand watering"} is scheduled little and often — short runs, not one deep soak`,
    });
  }
  if (!canIrrigate) {
    factors.push({ label: "Rain-fed plot — there is no irrigation to fall back on", delta: -1 });
  }
  if (eff.assumed && canIrrigate) {
    factors.push({
      label: "Delivery method not recorded — a conservative 60% application efficiency was assumed",
      delta: 0,
    });
  }
  if (start.source === "assumed") {
    factors.push({
      label: "No sensor or recent irrigation logged — starting soil moisture is an estimate",
      delta: 0,
    });
  }

  /* ── savings ──────────────────────────────────────────────────────────── */

  // The baseline is the habit this feature exists to replace: irrigate on a
  // fixed calendar, refill the whole root zone, ignore the forecast. Over a
  // 7-day window that is one full refill.
  //
  // ── Why this is gated ──────────────────────────────────────────────────
  // An earlier version compared the baseline against whatever the plan
  // scheduled, which meant a week where the soil simply had not dried to the
  // refill point yet reported "100% saved". That is not a saving, it is a
  // deferral — the crop will want that water next week, and claiming it as
  // banked would be exactly the kind of invented number `npk.ts` exists to
  // prevent. So a saving is only reported when we can point at what produced
  // it: an irrigation that ran smaller than a full refill, or one the rain
  // forecast let us skip outright.
  //
  // Nothing here is metered. The number compares two schedules on the same
  // week's weather; it does not measure anyone's pump, and it carries that
  // sentence wherever it is shown.
  //
  // ── Why the baseline differs by system ────────────────────────────────
  // "Refill the whole root zone once a week" is the habit of someone running
  // a surface system, and comparing a drip plan against it flatters drip
  // enormously — a single 15 mm top-up against a 110 mm flood reads as "85%
  // saved", which says more about the comparison than about the farmer.
  // A timer-driven drip user's actual habit is a fixed daily dose that
  // ignores the forecast, so that is what drip is measured against.
  let savings: IrrigationPlan["savings"] = null;
  if (canIrrigate && !ponded && (schedule.length > 0 || rainDeferredMm > 0)) {
    const baselineNetMm = highFrequency
      ? forecast.reduce((sum, d) => sum + d.etc, 0) // daily replacement, rain ignored
      : taw; // one full refill
    const baselineLitres = Math.round(mmToLitres(baselineNetMm / eff.value, farm.area));
    const plannedLitres = schedule.reduce((s, e) => s + e.volumeLitres, 0);
    const saved = baselineLitres - plannedLitres;
    if (saved > 0) {
      savings = {
        litresSaved: saved,
        percentSaved: Math.round((saved / Math.max(1, baselineLitres)) * 100),
        vsBaseline: highFrequency
          ? "running the system on a fixed daily timer that ignores the forecast"
          : "a fixed weekly schedule that refills the full root zone and ignores the forecast",
        provenance:
          "Modelled from this week's forecast, not metered — it compares two schedules, it does not measure your pump.",
      };
    }
  }

  if (rainDeferredMm > 0) {
    factors.push({
      label: `Rain in the forecast covers about ${round1(rainDeferredMm)} mm you would otherwise have pumped`,
      delta: 1,
    });
  }

  const needMm = todayEntry?.netMm ?? 0;
  const grossMm = todayEntry?.grossMm ?? 0;

  return {
    ...base,
    cropName: profile.displayName,
    stage,
    verdict,
    status,
    needMm,
    grossMm,
    volumeLitres: todayEntry?.volumeLitres ?? 0,
    runMinutes: todayEntry?.runMinutes ?? 0,
    availablePct: Math.round(((taw - start.dr) / Math.max(1, taw)) * 100),
    taw,
    raw,
    triggerMm,
    etcToday,
    factors,
    forecast,
    schedule,
    savings,
    balanceSource: start.source,
    ponded,
  };
}

/* ──────────────────────── rain-fed companion ────────────────────────────── */

/**
 * What a rain-fed farm would gain from irrigating.
 *
 * Shown instead of a schedule, because a schedule is useless without a water
 * source — but "you cannot act on this" is not a reason to show an empty page.
 * The deficit is real and knowing its size is what makes the case for a drip
 * line concrete rather than aspirational.
 */
export function rainfedOutlook(plan: IrrigationPlan): {
  stressDays: number;
  deficitMm: number;
  potentialLitres: number;
  worstDate: string | null;
} {
  const stressed = plan.forecast.filter((d) => d.depletionMm >= d.raw);
  const deficitMm = round1(
    stressed.reduce((s, d) => s + Math.max(0, d.depletionMm - d.raw), 0)
  );
  const worst = stressed.reduce<BalanceDay | null>(
    (acc, d) => (!acc || d.depletionMm > acc.depletionMm ? d : acc),
    null
  );
  return {
    stressDays: stressed.length,
    deficitMm,
    // What it would take to hold the crop at the refill point all week, applied
    // through drip — the best case, stated as such.
    potentialLitres: Math.round(mmToLitres(deficitMm / 0.9, plan.areaAcres)),
    worstDate: worst?.dateISO ?? null,
  };
}

/* ───────────────── tasks and alerts from a set of plans ─────────────────── */

/**
 * Today's watering turned into task seeds.
 *
 * Rides the existing daily-task machinery rather than inventing a parallel
 * one: the `"irrigation"` category already exists, `recordDayTasks` already
 * persists one row per (farmer, task, day), and the "you missed 2 of 5"
 * tally already counts them. A separate irrigation to-do list would duplicate
 * all of that and still not show up in the farmer's morning list.
 *
 * Keys are farm-scoped and date-free, matching `generateTasks()` — the daily
 * uniqueness comes from `due_date`, per migration 010.
 */

/* ──────────────────── tasks & alerts ────────────────────────────────────── */

/*
  The website carries these two as i18n message keys and resolves them through
  its dictionaries. The app's engines — agronomy's generateTasks, health's
  factors — all emit English literals and let the screen translate if it wants
  to, so these follow that convention instead. The wording is copied from the
  website's dynamic.ts so the same farm produces the same sentence on both.
*/

export function irrigationTaskSeeds(plans: IrrigationPlan[]): {
  key: string;
  title: string;
  meta: string;
  tone: "green" | "amber" | "blue";
  category: "irrigation";
}[] {
  const out: ReturnType<typeof irrigationTaskSeeds> = [];

  for (const p of plans) {
    const fk = p.farmId ?? String(p.farmIndex);

    if (p.verdict === "irrigate_today" && p.volumeLitres > 0) {
      const hours =
        p.runMinutes >= 60 ? `${Math.round((p.runMinutes / 60) * 10) / 10} h` : `${p.runMinutes} min`;
      out.push({
        key: `irrigate-${fk}`,
        title: `Irrigate ${p.cropName ?? "the crop"} — Farm ${p.farmIndex}`,
        meta: `${p.grossMm} mm · ${Math.round(p.volumeLitres).toLocaleString("en-IN")} L · about ${hours}`,
        tone: "blue",
        category: "irrigation",
      });
    }

    // A rain-fed plot cannot be told to irrigate, but it can be told to
    // protect what moisture is left — which is the only lever it has.
    if (p.regime === "rainfed" && (p.status === "deficit" || p.status === "critical")) {
      out.push({
        key: `conserve-${fk}`,
        title: `Conserve soil moisture — Farm ${p.farmIndex}`,
        meta: `Rain-fed · ${p.cropName ?? "crop"} below its comfort point`,
        tone: "amber",
        category: "irrigation",
      });
    }

    if (p.status === "over_irrigated") {
      out.push({
        key: `drain-${fk}`,
        title: `Check drainage — Farm ${p.farmIndex}`,
        meta: "Soil is at capacity with more water due",
        tone: "amber",
        category: "irrigation",
      });
    }
  }

  return out;
}

/**
 * Over- and under-irrigation, as alerts for the existing alerts list.
 *
 * Only the states a farmer can act on today, and only once per farm. The
 * `deficit` state deliberately does NOT raise an alert on an irrigated plot —
 * that is simply "time to water", which the schedule and the task already say,
 * and repeating it here would train people to ignore the alert panel.
 */
export function irrigationAlerts(plans: IrrigationPlan[]): {
  kind: "weather" | "disease" | "ai" | "critical" | "task";
  title: string;
  body: string;
}[] {
  const out: ReturnType<typeof irrigationAlerts> = [];

  for (const p of plans) {
    const crop = p.cropName ?? "The crop";
    if (p.status === "critical") {
      out.push({
        kind: "critical",
        title: `Farm ${p.farmIndex} is close to wilting point`,
        body:
          p.regime === "rainfed"
            ? `${crop} has used nearly all the water the soil can give, and there is no irrigation to fall back on. Mulch what you can and avoid disturbing the soil.`
            : `${crop} has used nearly all the available soil water. Irrigate today — about ${p.grossMm || Math.round(p.raw)} mm.`,
      });
    } else if (p.status === "over_irrigated") {
      out.push({
        kind: "weather",
        title: `Farm ${p.farmIndex} has more water than it can hold`,
        body: "The root zone is already full and more is on the way. Hold irrigation and make sure the field can drain — waterlogged roots lose yield as surely as dry ones.",
      });
    } else if (p.regime === "rainfed" && p.status === "deficit" && p.stage?.label === "Flowering") {
      // Flowering is the one stage where "a bit dry" is worth interrupting
      // someone for: the yield lost here does not come back.
      out.push({
        kind: "critical",
        title: `Farm ${p.farmIndex} is dry at flowering`,
        body: `${crop} is flowering on a rain-fed plot and is below its comfort point. Water stress now costs more yield than at any other stage.`,
      });
    }
  }

  return out;
}
