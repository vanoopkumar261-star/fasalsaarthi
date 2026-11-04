import { supabase } from "./supabase";

/**
 * First-run tutorial state.
 *
 * Lives in the `farmer_profiles.preferences` jsonb alongside `oilseed_ack` and
 * the notification toggles — the same place every other per-farmer preference
 * already goes, so this needs no migration and no new column.
 */

/**
 * Bump to re-run the tour for every farmer, including those who finished the
 * previous one. The only honest way to introduce a genuinely new feature: a
 * farmer who saw v1 has never seen the thing v2 explains.
 *
 * Do NOT bump for copy tweaks. Re-interrupting people to re-read what they have
 * already read is how a helpful tour turns into an annoyance they learn to
 * dismiss without looking.
 */
export const TOUR_VERSION = 2;

type Prefs = Record<string, any> | null | undefined;

/**
 * Should the tour open on this dashboard load?
 *
 * True only for a farmer who has never completed a tour at the current version.
 * Skipping counts as completing — someone who dismissed it does not want to be
 * asked again tomorrow.
 */
export function shouldRunTour(preferences: Prefs): boolean {
  if (!preferences) return true;
  if (!preferences.tour_completed_at) return true;
  const seen = Number(preferences.tour_version ?? 0);
  return !Number.isFinite(seen) || seen < TOUR_VERSION;
}

/**
 * Record that the farmer has been through the tour, by finishing or skipping.
 *
 * Reads the current preferences and merges rather than overwriting, because
 * this blob also holds `oilseed_ack` and the notification toggles — a blind
 * write would silently reset both.
 *
 * Never throws. The caller closes the overlay regardless of the outcome: a
 * failed write means the tour may appear once more, which is a far better
 * failure than trapping someone under a dimmed screen.
 */
export async function markTourSeen(farmerId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from("farmer_profiles")
      .select("preferences")
      .eq("id", farmerId)
      .maybeSingle();

    const existing = (data?.preferences as Record<string, any> | null) ?? {};

    await supabase
      .from("farmer_profiles")
      .update({
        preferences: {
          ...existing,
          tour_completed_at: new Date().toISOString(),
          tour_version: TOUR_VERSION,
        },
      })
      .eq("id", farmerId);
  } catch {
    /* preferences column missing or offline — the tour still closes */
  }
}

/**
 * Clear the flag so the tour runs again. Backs "Replay tutorial" in Settings,
 * which matters more than it looks: one handset is often shared between family
 * members, and the person who needs the tour is frequently not the person who
 * dismissed it.
 */
export async function resetTour(farmerId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from("farmer_profiles")
      .select("preferences")
      .eq("id", farmerId)
      .maybeSingle();

    const existing = { ...((data?.preferences as Record<string, any> | null) ?? {}) };
    delete existing.tour_completed_at;
    delete existing.tour_version;

    await supabase.from("farmer_profiles").update({ preferences: existing }).eq("id", farmerId);
  } catch {
    /* nothing to clear */
  }
}
