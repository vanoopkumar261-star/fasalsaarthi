import { API_BASE_URL } from "./apiBase";
import { authHeaders } from "./authHeaders";

export type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Non-streaming client for /api/chat. The web app streams token-by-token; the
 * mobile client instead awaits the full response text — React Native's fetch
 * doesn't reliably expose a readable stream reader across engines, and a
 * short wait-then-render is simpler and fine for a first pass. See
 * docs/MOBILE_APP_ROADMAP.md.
 *
 * The Bearer token identifies the farmer to the route, so replies are grounded
 * in their own crops, farms and weather, and each turn is saved to their chat
 * history — the same context the web assistant gets from its session cookie.
 */
export async function sendChat(messages: ChatMessage[], locale: string = "en"): Promise<string> {
  if (!API_BASE_URL) return "The assistant isn't configured on this build.";
  try {
    const res = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      // The locale was pinned to "en" here, so a farmer who had chosen Kannada
      // still got English answers. It now follows the app language.
      body: JSON.stringify({ messages, locale }),
    });
    const text = await res.text();
    if (!res.ok) return text || "The assistant is busy right now. Please try again.";
    return text;
  } catch (e) {
    console.error("CHAT error:", e);
    return "Couldn't reach the assistant. Check your connection and try again.";
  }
}
