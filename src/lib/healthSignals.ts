/**
 * Gathers the readings the farm-health score scores against.
 *
 * Separate from health.ts on purpose: that file is pure arithmetic and stays
 * testable without a network or a database. This is the part that goes and
 * fetches, and every piece of it is allowed to fail — a farm with no sensor,
 * no pH reading and no irrigation plan is a normal farm, not an error. Each
 * missing signal comes back null and the score renormalises over the rest.
 */
import { listReadings } from "./soil";
import { readHealthSensors } from "./sensors";
import { computeIrrigationPlan } from "./irrigation";
import type { FarmWithCrop } from "./dashboard";
import type { WeatherData } from "./weather";
import type { HealthSignals } from "./health";

/**
 * Every signal, fetched in parallel.
 *
 * Parallel because this sits between the farmer opening the app and seeing
 * their score: run in sequence, a slow ThingSpeak channel would hold up the pH
 * read for no reason. `allSettled` rather than `all` so one refusal cannot
 * empty the other two.
 */
export async function collectHealthSignals(input: {
  farmerId: string | null;
  farms: FarmWithCrop[];
  weather: WeatherData | null;
}): Promise<HealthSignals> {
  const { farmerId, farms, weather } = input;

  const [sensors, soilPh, availableWaterPct] = await Promise.all([
    readHealthSensors().catch(() => null),
    latestSoilPh(farmerId),
    meanAvailableWater(farms, weather),
  ]);

  return { sensors, soilPh, availableWaterPct };
}

async function latestSoilPh(farmerId: string | null): Promise<number | null> {
  if (!farmerId) return null;
  try {
    const readings = await listReadings(farmerId, 1);
    return readings[0]?.ph ?? null;
  } catch {
    return null;
  }
}

/**
 * Root-zone water across the holding, as one percentage.
 *
 * The score is for the farm as a whole, so the plots are averaged — but only
 * the ones the engine can actually model. A rain-fed plot still has a water
 * balance worth knowing, so it counts; a ponded crop does not, because
 * "available water" is not the quantity that describes a flooded paddy field
 * and averaging it in would drag the holding's figure somewhere meaningless.
 */
async function meanAvailableWater(
  farms: FarmWithCrop[],
  weather: WeatherData | null
): Promise<number | null> {
  try {
    const plans = farms
      .filter((f) => f.crop)
      .map((f) => computeIrrigationPlan({ farm: f, crop: f.crop ?? null, weather }))
      .filter((p) => !p.ponded);

    if (!plans.length) return null;
    return plans.reduce((s, p) => s + p.availablePct, 0) / plans.length;
  } catch {
    return null;
  }
}
