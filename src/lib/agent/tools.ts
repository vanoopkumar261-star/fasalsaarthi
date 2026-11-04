import { loadDoneKeys, persistTaskDone, tallyDayTasks, yesterdayKey } from "../tasks";
import { generateTasks } from "../agronomy";
import { deriveAlerts } from "../alerts";
import { getDashboardData } from "../dashboard";
import { computeFarmHealth } from "../health";
import { collectHealthSignals } from "../healthSignals";
import { computeIrrigationPlan } from "../irrigation";
import { saveReading } from "../soil";
import { phBand } from "../soilPh";
import { getWeather, type WeatherData } from "../weather";
import { agentContextStore } from "./context";
import { matchTask } from "./matchTask";
import { runScreenAction } from "./screenRegistry";
import type { ToolCall } from "./turn";

type T = (key: string, params?: Record<string, string | number>) => string;

export type ToolExecutionResult = { ok: true; summary: string } | { ok: false; reason: string };

/**
 * Runs a tool call the model asked for in /api/agent/turn's response.
 *
 * This is the ONLY place a voice-originated write actually happens — the
 * server never touches the database (see the route's own docstring). Every
 * argument is re-validated here rather than trusted, because the model can
 * be wrong about a type or send a category that doesn't exist even when its
 * schema said not to.
 *
 * This prototype (Farm Assistance) ships only the farm-advisory tools; the
 * marketplace tools (log_expense, check_price, find_store, …) belong to the
 * Platform Services work and are not part of this program.
 */
export async function executeToolCall(call: ToolCall, t: T): Promise<ToolExecutionResult> {
  switch (call.name) {
    case "mark_task_done":
      return executeMarkTaskDone(call.args, t);
    case "check_tasks":
      return executeCheckTasks(t);
    case "check_irrigation":
      return executeCheckIrrigation(call.args, t);
    case "check_health":
      return executeCheckHealth(call.args, t);
    case "check_alerts":
      return executeCheckAlerts(t);
    case "set_soil_ph":
      return executeSetSoilPh(call.args, t);
    default:
      return { ok: false, reason: t("agent.errorGeneric") };
  }
}

/**
 * The farms and the weather, fetched once.
 *
 * Several of the tools below need exactly this pair, and each fetching it
 * separately would mean a farmer asking two questions in a row pays for the
 * same dashboard read twice over a phone connection. Weather is allowed to
 * fail on its own: a farm list with no forecast still answers "what are my
 * tasks" and "how healthy is my farm", where no farm list answers nothing.
 */
async function farmContext(): Promise<{
  farmerId: string | null;
  farmer: Awaited<ReturnType<typeof getDashboardData>>["farmer"];
  farms: Awaited<ReturnType<typeof getDashboardData>>["farms"];
  weather: WeatherData | null;
}> {
  const dash = await getDashboardData();
  const lat = dash.farmer?.house_lat;
  const lng = dash.farmer?.house_lng;
  const weather = lat != null && lng != null ? await getWeather(lat, lng).catch(() => null) : null;
  return { farmerId: dash.farmer?.id ?? null, farmer: dash.farmer, farms: dash.farms, weather };
}

/** Picks the farm the farmer named, or null for "all of them". */
function farmAt<T extends { farm_index: number }>(farms: T[], args: Record<string, unknown>): T | null {
  const n = typeof args.farm_number === "number" && Number.isInteger(args.farm_number) ? args.farm_number : null;
  if (n == null) return null;
  return farms.find((f) => f.farm_index === n) ?? null;
}

/**
 * Today's jobs, spoken.
 *
 * The list is generated on the device from the farms and the forecast, so it
 * exists nowhere the model can read — which is why "what should I do today"
 * used to come back as either a navigation to Today or a guess from the farm
 * data. Done items are excluded: a farmer asking what is left does not want
 * to hear what they finished.
 */
async function executeCheckTasks(t: T): Promise<ToolExecutionResult> {
  let titles: string[];
  try {
    const { farmerId, farms, weather } = await farmContext();
    const tasks = generateTasks(farms, weather);
    const done = farmerId ? await loadDoneKeys(farmerId).catch(() => new Set<string>()) : new Set<string>();
    titles = tasks.filter((task) => !done.has(task.key)).map((task) => task.title);
  } catch {
    return { ok: false, reason: t("agent.errorOffline") };
  }
  if (!titles.length) return { ok: true, summary: t("agent.tasksNone") };
  // Three is what someone can hold in their head while working; the count
  // tells them whether there is more without reciting it.
  const head = titles.slice(0, 3).join(". ");
  const rest = titles.length > 3 ? ` ${t("agent.tasksMore", { n: titles.length - 3 })}` : "";
  return { ok: true, summary: `${t("agent.tasksCount", { n: titles.length })} ${head}.${rest}` };
}

/**
 * Whether to water, how much, and for how long.
 *
 * A full FAO-56 balance, computed here — the model has the weather in its
 * context and could produce a confident-sounding number from it, which is
 * exactly the mistake the prompt's own guideline warns against. This is the
 * figure the irrigation screen shows, so the voice and the screen agree.
 */
async function executeCheckIrrigation(args: Record<string, unknown>, t: T): Promise<ToolExecutionResult> {
  let ctx: Awaited<ReturnType<typeof farmContext>>;
  try {
    ctx = await farmContext();
  } catch {
    return { ok: false, reason: t("agent.errorOffline") };
  }
  if (!ctx.farms.length) return { ok: false, reason: t("agent.noFarms") };

  const named = farmAt(ctx.farms, args);
  const chosen = named ? [named] : ctx.farms;
  const plans = chosen.map((farm) =>
    computeIrrigationPlan({ farm, crop: farm.crop ?? null, weather: ctx.weather })
  );

  const due = plans.filter((p) => p.verdict === "irrigate_today");
  if (!due.length) {
    const rain = plans.some((p) => p.verdict === "rain_coming");
    return { ok: true, summary: rain ? t("agent.irrigateRain") : t("agent.irrigateHold") };
  }

  const said = due
    .map((p) =>
      t("agent.irrigateNow", {
        farm: p.farmIndex,
        mm: Math.round(p.grossMm),
        litres: Math.round(p.volumeLitres).toLocaleString("en-IN"),
        minutes: Math.max(1, Math.round(p.runMinutes)),
      })
    )
    .join(" ");
  return { ok: true, summary: said };
}

/**
 * The health score, spoken, with the reason.
 *
 * Deliberately a tool rather than prose: the score is a weighted six-condition
 * calculation done on the device and shown on the hub, so a number the model
 * reasoned out itself would contradict the one on screen — the worst kind of
 * wrong, because both look authoritative.
 */
async function executeCheckHealth(args: Record<string, unknown>, t: T): Promise<ToolExecutionResult> {
  try {
    const ctx = await farmContext();
    if (!ctx.farms.length) return { ok: false, reason: t("agent.noFarms") };
    const named = farmAt(ctx.farms, args);
    const farms = named ? [named] : ctx.farms;
    const signals = await collectHealthSignals({ farmerId: ctx.farmerId, farms, weather: ctx.weather });
    const health = computeFarmHealth({ farms, weather: ctx.weather, signals });

    /*
      The weakest MEASURED condition is the actionable half of the answer.
      `score: null` means nothing reported for it, and an unmeasured condition
      is not a problem — naming it would send the farmer to inspect something
      the app simply never read.
    */
    const worst = health.conditions
      .filter((c) => c.score != null)
      .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))[0];
    return {
      ok: true,
      summary: t("agent.healthSay", {
        score: Math.round(health.score),
        band: t(`home.${health.band}`),
        weakest: worst?.label ?? "",
      }).trim(),
    };
  } catch {
    return { ok: false, reason: t("agent.errorOffline") };
  }
}

/** Active warnings for this farm. Derived on the device from farms + forecast. */
async function executeCheckAlerts(t: T): Promise<ToolExecutionResult> {
  let alerts: ReturnType<typeof deriveAlerts>;
  try {
    const ctx = await farmContext();
    const missed = ctx.farmerId
      ? await tallyDayTasks(ctx.farmerId, yesterdayKey()).catch(() => undefined)
      : undefined;
    alerts = deriveAlerts({ farms: ctx.farms, weather: ctx.weather, missedYesterday: missed });
  } catch {
    return { ok: false, reason: t("agent.errorOffline") };
  }
  if (!alerts.length) return { ok: true, summary: t("agent.alertsNone") };

  // Critical first — a hazard outranks a missed checkbox.
  const order = { critical: 0, weather: 1, disease: 2, task: 3, ai: 4 } as const;
  const sorted = [...alerts].sort((a, b) => order[a.kind] - order[b.kind]);
  const head = sorted.slice(0, 2).map((a) => a.title).join(". ");
  const rest = sorted.length > 2 ? ` ${t("agent.alertsMore", { n: sorted.length - 2 })}` : "";
  return { ok: true, summary: `${t("agent.alertsCount", { n: sorted.length })} ${head}.${rest}` };
}

/**
 * Records a pH the farmer said out loud.
 *
 * A real write, so the value is bounded here rather than trusted: the schema
 * says 0-14 and a model that mishears "sixty four" would otherwise put 64 in
 * the soil table, where every pH band check downstream reads it as alkaline
 * beyond anything that exists. Saved as `manual`, which is what it is — the
 * photo path is the only thing entitled to call itself a meter reading.
 */
async function executeSetSoilPh(args: Record<string, unknown>, t: T): Promise<ToolExecutionResult> {
  const farmerId = agentContextStore.getState().farmerId;
  if (!farmerId) return { ok: false, reason: t("agent.errorOffline") };

  const ph = typeof args.ph === "number" && Number.isFinite(args.ph) ? args.ph : null;
  if (ph == null || ph < 3 || ph > 11) return { ok: false, reason: t("agent.phOutOfRange") };

  let farmId: string | null = null;
  try {
    const { farms } = await farmContext();
    farmId = farmAt(farms, args)?.id ?? null;
  } catch {
    // The reading is still worth saving against the farmer without a field.
  }

  const saved = await saveReading({ farmerId, farmId, ph, source: "manual" });
  if (!saved) return { ok: false, reason: t("agent.errorGeneric") };

  const band = phBand(ph);
  return { ok: true, summary: t("agent.phSaved", { ph, band: band.labelEn, advice: band.adviceEn }) };
}

/**
 * Ticking a task off, from anywhere in the app.
 *
 * This used to delegate to the Today screen outright, which meant the tool
 * worked on exactly one screen and answered "no task" everywhere else — the
 * farmer had to be looking at the thing they were trying not to look at.
 *
 * The mounted screen is still preferred when it IS mounted, because it owns
 * the checkbox the farmer can see and a headless write would leave it stale.
 * Only when the screen is absent do we regenerate the list ourselves —
 * generateTasks is pure, so the list is identical to the one the screen would
 * have built from the same farms and weather.
 */
async function executeMarkTaskDone(args: Record<string, unknown>, t: T): Promise<ToolExecutionResult> {
  const number = typeof args.task_number === "number" && Number.isInteger(args.task_number) && args.task_number > 0
    ? args.task_number
    : null;
  const described = typeof args.task === "string" && args.task.trim() ? args.task.trim() : null;
  // The schema marks neither as required so the model can send whichever it
  // can justify; a call with neither names no task at all.
  if (number == null && described == null) return { ok: false, reason: t("agent.noTask") };

  const onScreen = await runScreenAction("mark_task_done", args);
  if (onScreen) return { ok: true, summary: t("agent.taskDone", { task: onScreen }) };

  const farmerId = agentContextStore.getState().farmerId;
  if (!farmerId) return { ok: false, reason: t("agent.errorOffline") };

  let tasks: { key: string; title: string; meta?: string; tone?: string }[];
  try {
    const dash = await getDashboardData();
    const lat = dash.farmer?.house_lat;
    const lng = dash.farmer?.house_lng;
    const weather = lat != null && lng != null ? await getWeather(lat, lng) : null;
    tasks = generateTasks(dash.farms, weather);
  } catch {
    return { ok: false, reason: t("agent.errorOffline") };
  }
  if (!tasks.length) return { ok: false, reason: t("agent.noTask") };

  const task = number != null ? tasks[number - 1] : matchTask(tasks, described!);
  if (!task) return { ok: false, reason: t("agent.noTask") };

  // Already ticked is not a failure — the farmer asked for it to be done and
  // it is done. Saying "no task" here would read as if it had not registered.
  const alreadyDone = await loadDoneKeys(farmerId).catch(() => new Set<string>());
  if (!alreadyDone.has(task.key)) {
    const saved = await persistTaskDone(farmerId, task as never, true);
    if (!saved) return { ok: false, reason: t("agent.errorOffline") };
  }

  // Not written to the activity log, matching what the screen path has always
  // done. The log exists to drive undo, and the inverse of a ticked task is a
  // checkbox the farmer can already untick by hand.
  return { ok: true, summary: t("agent.taskDone", { task: task.title }) };
}

/**
 * The inverse side of a tool call — what `markUndone` in voice.tsx runs.
 *
 * This prototype ships no tool that writes an undoable ledger row (that is the
 * Platform Services work), so there is nothing to invert here.
 */
export async function executeInverse(_inverse: { tool: string; args: Record<string, unknown> }): Promise<boolean> {
  return false;
}
