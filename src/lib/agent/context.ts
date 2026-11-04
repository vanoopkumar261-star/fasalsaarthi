import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDashboardData, type FarmWithCrop, type FarmerProfile } from "../dashboard";
import { createStore, useStore } from "./store";

/**
 * What the agent knows about the signed-in farmer, without re-fetching on
 * every utterance. This is the app's first offline read cache — deliberately
 * small, deliberately not a general-purpose cache layer.
 *
 * Two things this exists specifically to enable, both from the approved plan:
 *   - resolving "farm 2" to an OWNED farm_id without ever trusting a value the
 *     model supplies (the no-UUID rule that makes a migration-021 violation
 *     structurally impossible to express)
 *   - answering "how many farms do I have" while offline, with an honest
 *     "this is from yesterday" rather than silence
 */
export type AgentContextState = {
  farmerId: string | null;
  farms: FarmWithCrop[];
  locale: string;
  screen: string;
  /**
   * The screen the farmer was on BEFORE the current one.
   *
   * The voice modal is itself a screen, so by the time a turn is being built
   * `screen` is always "/(app)/voice" and describing it would tell the model
   * about the microphone UI rather than the field the farmer is asking about.
   * This is the one the question is actually about.
   */
  previousScreen: string | null;
  online: boolean;
  hydratedAt: number | null; // epoch ms — lets a stale-data disclosure be honest
};

const CACHE_KEY = "af_agent_context_v1";

const initial: AgentContextState = {
  farmerId: null,
  farms: [],
  locale: "en",
  screen: "/(app)/hub",
  previousScreen: null,
  online: true,
  hydratedAt: null,
};

export const agentContextStore = createStore<AgentContextState>(initial);

export function useAgentContext<S = AgentContextState>(
  selector?: (s: AgentContextState) => S
): S {
  return useStore(agentContextStore, selector as any);
}

/**
 * Resolves a farmer-facing reference ("farm 1", "farm 2") to an id this
 * farmer actually owns. Returns null rather than guessing — the caller must
 * treat null as "refuse the write", never fall back to the first farm.
 *
 * This is the ONE place a farm reference becomes a UUID. No tool schema
 * anywhere should accept a raw id from the model; every write goes through
 * this function instead.
 */
export function resolveOwnedFarmIndex(index: number): string | null {
  const { farms } = agentContextStore.getState();
  const farm = farms.find((f) => f.farm_index === index);
  return farm?.id ?? null;
}

/** Same idea, by crop name (case-insensitive) rather than farm number. */
export function resolveOwnedFarmByCrop(cropName: string): string | null {
  const { farms } = agentContextStore.getState();
  const needle = cropName.trim().toLowerCase();
  const farm = farms.find((f) => f.crop?.chosen_crop?.toLowerCase() === needle);
  return farm?.id ?? null;
}

/**
 * Pulls fresh farmer/farm data and updates the store, persisting a snapshot
 * to AsyncStorage so a later cold start has something to answer from before
 * the network round trip completes.
 */
export async function hydrateAgentContext(locale: string): Promise<void> {
  try {
    const data = await getDashboardData();
    const next: AgentContextState = {
      farmerId: data.farmer?.id ?? null,
      farms: data.farms,
      locale,
      screen: agentContextStore.getState().screen,
      previousScreen: agentContextStore.getState().previousScreen,
      online: true,
      hydratedAt: Date.now(),
    };
    agentContextStore.setState(next);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
  } catch {
    // Genuinely offline, or the session is not ready yet. Fall back to
    // whatever was cached last time rather than clearing what we have.
    agentContextStore.setState({ online: false });
    await loadCachedContext();
  }
}

async function loadCachedContext(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw) as AgentContextState;
    agentContextStore.setState({ ...cached, online: false });
  } catch {
    // No cache yet, or it's corrupt — the store keeps its current (initial) state.
  }
}

/** Called by screens as they mount, so tool tiering knows what's on screen. */
export function setAgentScreen(route: string): void {
  agentContextStore.setState((prev) =>
    // A repeated set for the same route must not wipe the history — expo-router
    // fires on re-renders too, and two of them would leave previousScreen
    // pointing at the current screen.
    prev.screen === route ? {} : { screen: route, previousScreen: prev.screen }
  );
}

/**
 * The screen a question is about: the one behind the voice modal, falling back
 * to the current one when the agent is reached from somewhere else.
 */
export function subjectScreen(): string {
  const { screen, previousScreen } = agentContextStore.getState();
  return screen === "/(app)/voice" && previousScreen ? previousScreen : screen;
}

export function setAgentLocale(locale: string): void {
  agentContextStore.setState({ locale });
}

/** Human-readable staleness for a spoken disclosure, e.g. "from yesterday". */
export function contextAgeLabel(t: (key: string, params?: Record<string, string | number>) => string): string | null {
  const { hydratedAt, online } = agentContextStore.getState();
  if (online || !hydratedAt) return null;
  const hours = Math.round((Date.now() - hydratedAt) / 3_600_000);
  if (hours < 1) return null;
  if (hours < 20) return t("agent.staleHours", { hours });
  return t("agent.staleYesterday");
}

export type { FarmWithCrop, FarmerProfile };
