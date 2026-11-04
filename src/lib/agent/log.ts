import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase";
import { agentContextStore } from "./context";

/**
 * The "What I did" activity log for the voice agent's autonomous writes.
 *
 * Built from gateway records, never from model prose: an entry is written by
 * the code that actually ran a tool, not by the agent narrating what it did.
 * That is what makes a model that claims an action it never took immediately
 * visible — the log and the model's speech are two independent sources that
 * either agree or don't.
 *
 * Two copies, written together: this AsyncStorage ring (fast, always
 * available, what undo/repeat actually read) and `agent_actions` (027, web
 * repo) — a durable copy that survives a reinstall. The remote write is
 * fire-and-forget: losing it only means a lost audit trail, never a lost
 * ability to undo the thing that just happened, so it must never block or
 * fail the local write it rides along with.
 */
export type ActivityEntry = {
  id: string;
  at: number; // epoch ms
  tool: string;
  args: Record<string, unknown>;
  summary: string; // what to show/speak — "Logged ₹2,000 for Fertilizer"
  inverse: { tool: string; args: Record<string, unknown> } | null;
  undone: boolean;
  /** The matching agent_actions row id, once the durable write succeeds. Null if it hasn't (yet, or ever). */
  remoteId: string | null;
};

const KEY = "af_agent_activity_v1";
const MAX_ENTRIES = 200;

let cache: ActivityEntry[] | null = null;

async function load(): Promise<ActivityEntry[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as ActivityEntry[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function persist(entries: ActivityEntry[]): Promise<void> {
  cache = entries;
  await AsyncStorage.setItem(KEY, JSON.stringify(entries)).catch(() => {
    // A log write failing must never block the action it is recording.
  });
}

export async function recordAction(entry: Omit<ActivityEntry, "id" | "at" | "undone" | "remoteId">): Promise<ActivityEntry> {
  const full: ActivityEntry = {
    ...entry,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    undone: false,
    remoteId: null,
  };
  const entries = await load();
  const next = [full, ...entries].slice(0, MAX_ENTRIES);
  await persist(next);

  // Fire-and-forget: the farmer already has their local entry (and thus their
  // ability to undo) regardless of whether this succeeds. Not awaited, so a
  // slow or offline network never delays the write it's logging.
  syncActionRemote(full).catch(() => {});

  return full;
}

/** Inserts the durable copy (027, web repo) and patches the local entry with its id once it lands. */
async function syncActionRemote(entry: ActivityEntry): Promise<void> {
  const farmerId = agentContextStore.getState().farmerId;
  if (!farmerId) return;
  const { data, error } = await supabase
    .from("agent_actions")
    .insert([{ farmer_id: farmerId, tool: entry.tool, args: entry.args, summary: entry.summary, inverse: entry.inverse }])
    .select("id")
    .single();
  // No agent_actions table yet, offline, or the insert otherwise failed — the
  // local ring already has this entry and undo/repeat read only from it, so
  // there is nothing further to do.
  if (error || !data?.id) return;

  // Re-read rather than close over the entry list from recordAction — another
  // write may have happened while this insert was in flight.
  const current = await load();
  const patched = current.map((e) => (e.id === entry.id ? { ...e, remoteId: data.id as string } : e));
  await persist(patched);
}

export async function markUndone(id: string): Promise<void> {
  const entries = await load();
  const target = entries.find((e) => e.id === id);
  const next = entries.map((e) => (e.id === id ? { ...e, undone: true } : e));
  await persist(next);

  // Same fire-and-forget rule as recordAction: local state (already updated
  // above) is what undo/repeat actually read, so a failure here is silent.
  if (target?.remoteId) {
    supabase.from("agent_actions").update({ undone: true }).eq("id", target.remoteId).then(
      () => {},
      () => {}
    );
  }
}

export async function recentActions(limit = 50): Promise<ActivityEntry[]> {
  const entries = await load();
  return entries.slice(0, limit);
}

/** The single most recent un-undone write — what the undo bar/spoken word targets. */
export async function lastUndoable(): Promise<ActivityEntry | null> {
  const entries = await load();
  return entries.find((e) => !e.undone && e.inverse) ?? null;
}
