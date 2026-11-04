import { API_BASE_URL } from "../apiBase";
import { authHeaders } from "../authHeaders";
import type { ChatMessage } from "../chat";

export type ToolCall = { name: string; args: Record<string, unknown> };

export type TurnResult =
  | { kind: "reply"; text: string }
  | { kind: "toolCall"; call: ToolCall };

/**
 * Client for /api/agent/turn (web repo) — the tool-calling counterpart to
 * sendChat() in chat.ts. Tried by voice.tsx AFTER the Tier-1 local command
 * match fails, same position /api/chat used to occupy: this is what lets a
 * spoken command turn into a real write ("log 2000 for fertilizer") instead
 * of only ever producing prose.
 *
 * Never returns a farm UUID or anything else the caller must trust blindly —
 * a toolCall's args are exactly what the model was allowed to say (see the
 * route's TOOLS schema) and every one of them is validated again by this
 * app's own tool executor (agent/tools.ts) before anything is written.
 */
export async function sendTurn(
  messages: ChatMessage[],
  locale: string,
  screenSummary?: string,
  noTools = false
): Promise<TurnResult> {
  if (!API_BASE_URL) return { kind: "reply", text: "The assistant isn't configured on this build." };
  try {
    const res = await fetch(`${API_BASE_URL}/api/agent/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ messages, locale, screenSummary, noTools }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      /*
        The server usually knows exactly what went wrong and says so. Only
        `reply` was being read, so a 402 carrying
        "You have used all 20 this month." was thrown away and replaced with
        "the assistant is busy" — which is not true, not actionable, and reads
        as a broken app rather than a plan limit. A farmer who has run out of
        questions needs to be told that, not told to try again at something
        that will refuse them every time until the month turns over.
      */
      if (res.status === 402 && typeof json?.error === "string") {
        const upgrade =
          json.reason === "quota"
            ? " You can change your plan in Settings."
            : " Open Settings to see which plan includes it.";
        return { kind: "reply", text: json.error + upgrade };
      }
      const said = typeof json?.reply === "string" ? json.reply : typeof json?.error === "string" ? json.error : null;
      return { kind: "reply", text: said ?? "The assistant is busy right now. Please try again." };
    }
    if (json?.toolCall?.name) {
      return { kind: "toolCall", call: { name: String(json.toolCall.name), args: json.toolCall.args ?? {} } };
    }
    return { kind: "reply", text: typeof json?.reply === "string" ? json.reply : "" };
  } catch (e) {
    console.error("AGENT TURN error:", e);
    return { kind: "reply", text: "Couldn't reach the assistant. Check your connection and try again." };
  }
}
