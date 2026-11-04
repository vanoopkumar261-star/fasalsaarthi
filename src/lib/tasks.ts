import { supabase } from "./supabase";
import type { TaskSeed } from "./agronomy";

/**
 * Client-side persistence for interactive farm tasks. Backed by the
 * farm_tasks table (web migrations 004 + 010). Mirrors the web app's
 * lib/tasks.ts + lib/tasks-server.ts, merged into one file since mobile
 * has no RSC boundary — every read/write goes through the same signed-in
 * Supabase client, RLS-scoped to this farmer either way.
 *
 * Completion is per DAY, not per task: task keys are stage-derived
 * (`scout-early-<farmId>`) and recur every day a stage lasts, so `due_date`
 * is what separates today's copy from yesterday's. Everything here
 * degrades gracefully — before the migrations are applied the queries
 * error and these helpers quietly report "not persisted" so the UI stays
 * interactive (session-only) instead of breaking.
 */

type PersistTask = { key: string; title: string; meta: string; tone: string };

/** Local calendar day as yyyy-mm-dd — the farmer's day, not UTC's. */
export function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayKey(d);
}

/** Upsert a task's completion state for a given day. True only if it persisted. */
export async function persistTaskDone(
  farmerId: string,
  task: PersistTask,
  done: boolean,
  day: string = todayKey()
): Promise<boolean> {
  try {
    const { error } = await supabase.from("farm_tasks").upsert(
      {
        farmer_id: farmerId,
        task_key: task.key,
        title: task.title,
        meta: task.meta,
        tone: task.tone,
        status: done ? "done" : "open",
        due_date: day,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "farmer_id,task_key,due_date" }
    );
    return !error;
  } catch {
    return false;
  }
}

/** Task keys the farmer completed on `day` (defaults to today). */
export async function loadDoneKeys(farmerId: string, day: string = todayKey()): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from("farm_tasks")
      .select("task_key")
      .eq("farmer_id", farmerId)
      .eq("due_date", day)
      .eq("status", "done");
    if (error || !data) return new Set();
    return new Set(data.map((r: any) => r.task_key as string));
  } catch {
    return new Set();
  }
}

/**
 * Records today's generated tasks as `open`, once. `ignoreDuplicates` is
 * essential: this runs on every Home load, and a plain upsert would reset
 * a task the farmer already ticked back to `open`.
 */
export async function recordDayTasks(farmerId: string, tasks: TaskSeed[], day: string = todayKey()): Promise<void> {
  if (!tasks.length) return;
  try {
    const rows = tasks.map((t) => ({
      farmer_id: farmerId,
      task_key: t.key,
      title: t.title,
      meta: t.meta,
      tone: t.tone,
      category: t.category,
      status: "open",
      due_date: day,
    }));
    await supabase.from("farm_tasks").upsert(rows, {
      onConflict: "farmer_id,task_key,due_date",
      ignoreDuplicates: true,
    });
  } catch {
    /* table may not exist yet — no-op */
  }
}

export type DayTaskTally = { total: number; done: number; missed: number };

/** How many of a given day's tasks were completed. Zeroes when nothing is recorded. */
export async function tallyDayTasks(farmerId: string, day: string): Promise<DayTaskTally> {
  try {
    const { data, error } = await supabase.from("farm_tasks").select("status").eq("farmer_id", farmerId).eq("due_date", day);
    if (error || !data) return { total: 0, done: 0, missed: 0 };
    const total = data.length;
    const done = data.filter((r: any) => r.status === "done").length;
    return { total, done, missed: total - done };
  } catch {
    return { total: 0, done: 0, missed: 0 };
  }
}
