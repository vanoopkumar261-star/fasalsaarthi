import { authHeaders } from "./authHeaders";

/**
 * Where the phone briefing lives. It is a separate server from the rest of the
 * app's API (EXPO_PUBLIC_API_BASE_URL): the Twilio call bot runs from its own
 * deployment, so it can change without touching the main backend.
 */
export const CALLBOT_URL = (process.env.EXPO_PUBLIC_CALLBOT_URL ?? "").replace(/\/+$/, "");

export type CallResult = { ok: true; to: string } | { ok: false; error: string };

/**
 * Asks the server to ring the signed-in farmer's own phone (the number on
 * their profile) with the voice briefing: language choice, farm status,
 * official warnings, then questions.
 */
export async function requestBriefingCall(): Promise<CallResult> {
  if (!CALLBOT_URL) return { ok: false, error: "" };
  try {
    const res = await fetch(`${CALLBOT_URL}/api/phone/call-me`, {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, to: String(body?.to ?? "") };
    // The server's message is written for farmers; 429 has its own wording.
    return { ok: false, error: res.status === 429 ? "rateLimited" : String(body?.error ?? "") };
  } catch {
    return { ok: false, error: "" };
  }
}
