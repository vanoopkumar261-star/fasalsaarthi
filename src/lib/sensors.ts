import { API_BASE_URL } from "./apiBase";

/**
 * Live field-sensor readings, read back from the web app's /api/sensors.
 *
 * ESP32 nodes publish temperature / humidity / soil-moisture to ThingSpeak and
 * the route turns that into a per-metric series. It needs no auth and falls
 * back to the project's shared demo channel when a deployment has no channel of
 * its own, so this returns real readings with nothing configured.
 *
 * These types mirror the route's exported ones (web repo,
 * src/app/api/sensors/route.ts) — keep them in step if the route changes.
 */

export type MetricKey = "temperature" | "humidity" | "soilMoisture" | "npk";

export type SensorReading = { at: string; value: number };

export type SensorMetric = {
  key: MetricKey;
  /** A channel maps a field number for this metric. */
  configured: boolean;
  unit: string;
  /** Most recent reading, or null if the channel returned nothing usable. */
  latest: SensorReading | null;
  /** Newest first. */
  readings: SensorReading[];
  /**
   * A stand-in value shown because no hardware reports this metric yet.
   *
   * Deliberately separate from `configured`: a placeholder must render a value
   * without ever counting as a live channel. Marking it `configured` would make
   * the "no sensor connected" empty state unreachable, and giving it a
   * timestamp would pin the Live badge on for ever with the probe unplugged.
   */
  placeholder?: boolean;
  /** For metrics that are several numbers rather than one, e.g. N / P / K. */
  parts?: { label: string; value: number }[];
};

export type SensorSnapshot = {
  configured: boolean;
  /** Newest reading time across all metrics, ISO. */
  updatedAt: string | null;
  metrics: SensorMetric[];
};

/** A reading is "live" only while it is fresh — presence alone isn't enough. */
export const STALE_AFTER_MS = 30 * 60 * 1000;

/** Matches the web panel's refresh cadence; ThingSpeak feeds are minute-grained. */
export const POLL_MS = 60 * 1000;

export const METRIC_ORDER: MetricKey[] = ["temperature", "humidity", "soilMoisture", "npk"];

/**
 * Translation keys rather than English literals — the metric names are on the
 * home screen, so leaving them here left three English words on an otherwise
 * fully translated screen.
 */
export const METRIC_LABEL_KEY: Record<MetricKey, string> = {
  temperature: "sensorPanel.metric.temperature",
  humidity: "sensorPanel.metric.humidity",
  soilMoisture: "sensorPanel.metric.soilMoisture",
  npk: "sensorPanel.metric.npk",
};

/** Icon + hue per metric, matching the web panel so the two read as one product. */
export const METRIC_META: Record<MetricKey, { icon: string; color: string }> = {
  temperature: { icon: "thermometer-outline", color: "#B58A18" }, // Mustard
  humidity: { icon: "water-outline", color: "#3E6FB8" }, // Field Blue
  soilMoisture: { icon: "leaf-outline", color: "#3F7A2E" }, // Crop Green
  npk: { icon: "flask-outline", color: "#7A5C2E" }, // Earth Brown
};

export function isFresh(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && Date.now() - t < STALE_AFTER_MS;
}

/** "just now" / "12m ago" / "3h ago" / "2d ago". */
export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export async function getSensors(): Promise<SensorSnapshot | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/sensors`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SensorSnapshot;
  } catch (e) {
    console.warn("SENSORS fetch failed:", e);
    return null;
  }
}

/**
 * Just the three numbers the farm-health score needs, flattened.
 *
 * `placeholder` readings are excluded deliberately. A stand-in value exists so
 * the sensor card renders something on a farm with no hardware; letting it
 * reach the health score would mean scoring a farm on a number nobody
 * measured, which is exactly the dishonesty the condition-based score was
 * written to remove. Null means "not measured", and the score skips it rather
 * than counting it as bad.
 */
export async function readHealthSensors(): Promise<{
  temperature: number | null;
  humidity: number | null;
  soilMoisture: number | null;
}> {
  try {
    const snap = await getSensors();
    if (!snap) return { temperature: null, humidity: null, soilMoisture: null };
    const val = (k: MetricKey) => {
      const m = snap.metrics.find((x) => x.key === k);
      return m && m.configured && !m.placeholder ? (m.latest?.value ?? null) : null;
    };
    return {
      temperature: val("temperature"),
      humidity: val("humidity"),
      soilMoisture: val("soilMoisture"),
    };
  } catch {
    return { temperature: null, humidity: null, soilMoisture: null };
  }
}
