import { useEffect, useState } from "react";

/**
 * The pending-intent channel: how the agent hands a screen something to show
 * before that screen exists. There is no navigation-with-payload today —
 * router.push only carries string route params — so "log this expense" has
 * nowhere to put the ₹2,000 it heard until this exists.
 *
 * Consume-once by design: an intent is read exactly once, by the first screen
 * that asks for its kind, and is then gone. Without that, backing out of the
 * money screen and returning to it later would silently re-apply a stale
 * prefill the farmer already dismissed or already acted on.
 */
export type Intent<T = unknown> = {
  kind: string;
  payload: T;
  createdAt: number;
  ttlMs: number;
};

let pending: Intent | null = null;
const listeners = new Set<() => void>();

export function publishIntent<T>(kind: string, payload: T, ttlMs = 30_000): void {
  pending = { kind, payload, createdAt: Date.now(), ttlMs };
  listeners.forEach((l) => l());
}

/** Reads and clears an intent of this kind if one is pending and not expired. */
function consumeIntent<T>(kind: string): T | null {
  if (!pending || pending.kind !== kind) return null;
  if (Date.now() - pending.createdAt > pending.ttlMs) {
    pending = null;
    return null;
  }
  const payload = pending.payload as T;
  pending = null;
  listeners.forEach((l) => l());
  return payload;
}

/**
 * A screen calls this once on mount to claim any waiting intent of its kind.
 * Returns null on every render after the first consumption, and null forever
 * if nothing was pending — a screen opened by a normal tap behaves exactly as
 * it does today.
 */
export function usePendingIntent<T>(kind: string): T | null {
  const [value, setValue] = useState<T | null>(() => consumeIntent<T>(kind));

  useEffect(() => {
    // Re-check once on mount in case the intent was published between the
    // initial render and the effect running (fast-refresh, StrictMode double
    // render) — consumeIntent is idempotent-safe because it nulls `pending`
    // the first time it matches.
    if (value === null) {
      const v = consumeIntent<T>(kind);
      if (v !== null) setValue(v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}

/** For the agent overlay: is anything currently waiting for a screen to claim it? */
export function onIntentPublished(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
