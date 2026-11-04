import { useSyncExternalStore } from "react";

/**
 * The smallest possible global store, because the app has none today — every
 * screen holds its own copy of getDashboardData(). This is deliberately not
 * Redux/Zustand/React Query: the agent needs exactly one thing a component
 * tree can't give it — state readable from OUTSIDE the render tree (the voice
 * loop, the gateway) — and that's what this buys, in about 40 lines.
 *
 * Built on React 18's own useSyncExternalStore rather than a library, so a
 * component subscribes with zero new dependency and re-renders only when the
 * slice it reads actually changes (via the optional `selector`).
 */
export type Store<T> = {
  getState: () => T;
  setState: (patch: Partial<T> | ((prev: T) => Partial<T>)) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();

  const getState = () => state;

  const setState: Store<T>["setState"] = (patch) => {
    const next = typeof patch === "function" ? (patch as (prev: T) => Partial<T>)(state) : patch;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };

  const subscribe: Store<T>["subscribe"] = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { getState, setState, subscribe };
}

/**
 * Subscribes a component to a store, optionally to just one derived slice so
 * an unrelated field changing does not re-render it. `selector` defaults to
 * identity — the whole state — which is fine for small stores like this one.
 */
export function useStore<T extends object, S = T>(
  store: Store<T>,
  selector: (state: T) => S = (s) => s as unknown as S
): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState())
  );
}
