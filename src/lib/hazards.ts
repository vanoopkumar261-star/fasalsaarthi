import { API_BASE_URL } from "./apiBase";
import { authHeaders } from "./authHeaders";

/**
 * Official disaster / severe-weather warnings for the signed-in farmer's own
 * district — IMD, the Central Water Commission and the state SDMAs, via NDMA's
 * SACHET feed.
 *
 * All the work happens on the web app's `/api/hazards/check`: fetching the CAP
 * feed, and deciding which warnings actually name this farmer's district. That
 * matching deliberately does NOT live here. It is subtle enough to get wrong
 * (see the web repo's `src/lib/hazards/match.ts`), and a second copy in this
 * repo would eventually disagree with the first — meaning the app and the
 * website could tell the same farmer different things about the same storm.
 *
 * Identity travels as a Bearer token, the same as every other authenticated
 * call from this app.
 */

/** IMD's own warning colours: red = act now, orange = prepare, yellow = be aware. */
export type HazardBand = "red" | "orange" | "yellow";

export type MatchedAlert = {
  band: HazardBand;
  event: string;
  severity: string;
  certainty: string | null;
  urgency: string | null;
  /** The issuing agency's own words. Display verbatim — never translate. */
  headline: string;
  instruction: string | null;
  sender: string | null;
  onset: string | null;
  expires: string | null;
  matchedOn: "district" | "state";
};

export type HazardCheck = {
  district: string | null;
  state: string | null;
  checkedAt: string;
  freshness: "live" | "cached";
  dataAsOf: string | null;
  red: MatchedAlert[];
  orange: MatchedAlert[];
  yellow: MatchedAlert[];
  reason?: "no-location";
};

export async function checkHazards(): Promise<HazardCheck | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/hazards/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      // A stale store makes the route pull the CAP feed inline before answering.
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    return (await res.json()) as HazardCheck;
  } catch (e) {
    console.warn("HAZARD check failed:", e);
    return null;
  }
}

/** Warnings that warrant interrupting the farmer, as opposed to context. */
export function highAlertCount(check: HazardCheck | null): number {
  if (!check) return 0;
  return check.red.length + check.orange.length;
}

/** Issued and timed in IST by every one of these agencies, so shown in IST. */
export function istTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}
