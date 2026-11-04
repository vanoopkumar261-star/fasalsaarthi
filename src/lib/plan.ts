/**
 * The farmer's tier and this month's usage, read from the website's /api/plan.
 *
 * The app does not compute entitlements. The server owns them — it reads the
 * same `farmer_profiles.plan` column it enforces against, and the counters
 * here are the ones that actually refuse a request. Anything the app worked
 * out locally would be a second opinion that could disagree with the thing
 * doing the refusing, which is the whole reason plans.ts is shared verbatim.
 */
import { API_BASE_URL } from "./apiBase";
import { authHeaders } from "./authHeaders";
import { planOf, type Cycle, type PlanId, type Quota } from "./plans";

export type PlanUsage = {
  disease_scan: number;
  assistant_query: number;
  live_lookup: number;
};

export type PlanState = {
  plan: PlanId;
  cycle: Cycle | null;
  selectedAt: string | null;
  limits: {
    diseaseScans: Quota;
    assistantQueries: Quota;
    fields: number;
    liveLookups: Quota;
    historyDays: Quota;
  } | null;
  usage: PlanUsage | null;
};

/** Null when the tier could not be read — the caller shows what it already had. */
export async function getPlanState(): Promise<PlanState | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/plan`, {
      headers: { Accept: "application/json", ...(await authHeaders()) },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return {
      plan: planOf(j?.plan),
      cycle: j?.cycle ?? null,
      selectedAt: j?.selectedAt ?? null,
      limits: j?.limits ?? null,
      usage: j?.usage ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Change tier. Returns the error sentence to show, or null on success.
 *
 * Nothing is charged: this records which tier the farmer chose. Downgrades can
 * be refused by the server when the farmer has more fields than the smaller
 * tier allows, and that refusal is passed straight through rather than
 * second-guessed here.
 */
export async function setPlan(plan: PlanId, cycle: Cycle): Promise<string | null> {
  if (!API_BASE_URL) return "The assistant isn't configured on this build.";
  try {
    const res = await fetch(`${API_BASE_URL}/api/plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(await authHeaders()),
      },
      body: JSON.stringify({ plan, cycle }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) return j?.error ?? "That didn't save. Please try again.";
    return null;
  } catch {
    return "No connection. Your plan was not changed.";
  }
}
