import { API_BASE_URL } from "../apiBase";
import { authHeaders } from "../authHeaders";

export type FieldKind = "name" | "phone" | "number" | "choice" | "yesno" | "date" | "place";

/**
 * Turns a spoken onboarding answer into the one value its form field holds,
 * via the web app's /api/agent/onboard ("do ekad" -> 2). Null when the answer
 * held no such value or the server could not be reached; the caller asks again.
 */
export async function extractField(
  kind: FieldKind,
  utterance: string,
  question: string,
  options?: string[]
): Promise<string | number | boolean | null> {
  if (!API_BASE_URL) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/agent/onboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ kind, utterance, question, options }),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return json?.value ?? null;
  } catch (e) {
    console.error("ONBOARD EXTRACT error:", e);
    return null;
  }
}
