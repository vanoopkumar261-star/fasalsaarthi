import { useEffect, useRef } from "react";

/**
 * What a screen is showing right now, in one short sentence — what makes
 * "what does this say?" and "add that one too" answerable at all.
 *
 * A screen registers a `describe()` function on mount and clears it on
 * unmount. The agent reads the CURRENT screen's description (via
 * agentContext.screen) as `screenSummary` in the /api/agent/turn request —
 * this module holds no opinion about which screen is "current", only what
 * each registered screen would say about itself if asked.
 */
const registry = new Map<string, () => string>();

/** Route path (matching agentContext.screen) -> a live describe() function. */
export function registerScreenDescriber(route: string, describe: () => string): () => void {
  registry.set(route, describe);
  return () => {
    // Only clear if this registration is still the current one — guards
    // against an unmount racing a re-mount under fast refresh.
    if (registry.get(route) === describe) registry.delete(route);
  };
}

/**
 * Clamped to 600 chars — this rides in every /api/agent/turn request body and
 * may be spoken aloud as-is. A describer returns "" while its data is still
 * loading, which reads here as "nothing to say yet".
 */
export function describeScreen(route: string): string | null {
  const describe = registry.get(route);
  if (!describe) return null;
  try {
    const text = describe().trim();
    if (!text) return null;
    return text.length > 600 ? `${text.slice(0, 597)}...` : text;
  } catch {
    return null; // a screen mid-render throwing here must never break the agent
  }
}

/** Resolves once `route` has mounted and loaded enough to describe itself, or null after `timeoutMs`. */
export async function waitForDescription(route: string, timeoutMs = 6000): Promise<string | null> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const text = describeScreen(route);
    if (text) return text;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

/**
 * A screen's one line of voice support: `useScreenDescriber("/market", () => ...)`.
 * Return "" until the data has loaded. Always reads the latest render's closure.
 */
export function useScreenDescriber(route: string, describe: () => string): void {
  const ref = useRef(describe);
  useEffect(() => {
    ref.current = describe;
  });
  useEffect(() => registerScreenDescriber(route, () => ref.current()), [route]);
}

/** Things a mounted screen can do when the agent asks (e.g. Today's mark_task_done). */
const actions = new Map<string, (args: Record<string, unknown>) => Promise<string | null>>();

export function useScreenAction(name: string, run: (args: Record<string, unknown>) => Promise<string | null>): void {
  const ref = useRef(run);
  useEffect(() => {
    ref.current = run;
  });
  useEffect(() => {
    const fn = (args: Record<string, unknown>) => ref.current(args);
    actions.set(name, fn);
    return () => {
      if (actions.get(name) === fn) actions.delete(name);
    };
  }, [name]);
}

/** The action's spoken result, or null when no mounted screen offers it. */
export async function runScreenAction(name: string, args: Record<string, unknown>): Promise<string | null> {
  const fn = actions.get(name);
  return fn ? fn(args) : null;
}
