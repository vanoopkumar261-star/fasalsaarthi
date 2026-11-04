import { supabase } from "./supabase";

/**
 * The farmer's notification history.
 *
 * The phone has had the four notification *preference* toggles since Settings
 * was built, and nothing to apply them to: no inbox, no record, nothing to
 * look back at. Meanwhile the website has been writing rows into this table
 * on every dashboard render, so a farmer who used both saw a bell with
 * history on the web and no bell at all on the phone.
 *
 * Everything here is RLS-scoped through the app's own session and degrades to
 * empty or a no-op, matching the convention in tasks.ts — the table may not
 * exist on a project where migration 006 has not been applied.
 */

export type NotificationRow = {
  id: string;
  dedupe_key: string;
  kind: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
};

export type NotifSeed = { dedupeKey: string; kind: string; title: string; body?: string };

export async function loadNotifications(farmerId: string, limit = 25): Promise<NotificationRow[]> {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("farmer_id", farmerId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as NotificationRow[];
  } catch {
    return [];
  }
}

export async function markAllRead(farmerId: string): Promise<void> {
  try {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("farmer_id", farmerId)
      .eq("read", false);
  } catch {
    /* table may not exist yet */
  }
}

/**
 * Records today's alerts and tasks, deduped by `(farmer_id, dedupe_key)` so
 * the same alert on the same day is written once rather than on every pull to
 * refresh.
 *
 * The web does this from a server component; here it runs from the device
 * under the same RLS session, which is why the upsert is identical and the
 * dedupe keys have to match the web's exactly — the two clients write into one
 * table for one farmer, and a different key format would duplicate every row
 * for anyone who uses both.
 */
export async function syncNotifications(farmerId: string, seeds: NotifSeed[]): Promise<void> {
  if (!seeds.length) return;
  try {
    const rows = seeds.map((s) => ({
      farmer_id: farmerId,
      dedupe_key: s.dedupeKey,
      kind: s.kind,
      title: s.title,
      body: s.body ?? null,
    }));
    await supabase
      .from("notifications")
      .upsert(rows, { onConflict: "farmer_id,dedupe_key", ignoreDuplicates: true });
  } catch {
    /* table may not exist yet — no-op */
  }
}

/**
 * Relative time, through the translated strings rather than English literals —
 * these appear on an otherwise fully translated screen, and the keys were
 * already carried over from the web dictionary.
 */
export function notifTimeAgo(
  iso: string,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "";
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return t("notifications.justNow");
  if (mins < 60) return t("notifications.minsAgo", { n: mins });
  if (hours < 24) return t("notifications.hoursAgo", { n: hours });
  if (days === 1) return t("notifications.yesterday");
  return t("notifications.daysAgo", { n: days });
}
