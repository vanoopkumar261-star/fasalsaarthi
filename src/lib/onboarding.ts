/**
 * Registration writes — the mobile counterpart of the web app's
 * `createFarmerProfile` / `createFarms` / `createCropCycles` in src/lib/db.ts.
 *
 * The logic is deliberately kept identical to the web version rather than
 * simplified: both clients write the same three tables in the same Supabase
 * project, so a rule that exists in only one of them (profile de-duplication,
 * farm-index continuation) is a rule a farmer can walk around by registering
 * from the other device. RLS scopes every write to the signed-in owner.
 */

import { supabase } from "./supabase";
import { estimateYieldLabel, suggestHarvestDate } from "./agronomy";
import { API_BASE_URL } from "./apiBase";
import type { SelectedLocation } from "./geocode";
import {
  composeIrrigationLabel,
  type IrrigationMethod,
  type IrrigationSource,
  type WaterRegime,
} from "./irrigationCatalog";
import type { Cycle, PlanId } from "./plans";

export type FarmDraft = {
  area: string;
  soilType: string;
  /** Stage one: rain-fed or irrigated. Empty until the farmer answers. */
  regime: WaterRegime | "";
  /** Stage two, irrigated only: where the water comes from. */
  source: IrrigationSource | "";
  /** Stage two, irrigated only: how it reaches the crop. Sets efficiency. */
  method: IrrigationMethod | "";
};

/**
 * The composite written to the legacy `farms.irrigation` column, which is
 * `not null` and still read by the farm chip, the assistant's context block
 * and three prompts. Empty while the farmer has not answered yet.
 */
export function farmIrrigationLabel(f: FarmDraft): string {
  if (!f.regime) return "";
  return composeIrrigationLabel(f.regime, f.source || null, f.method || null);
}

export type CropSelection = {
  chosenCrop: string;
  customCrop: string;
  seedingDate: string;
  estimatedHarvestDate: string;
  /** Set once the farmer edits the harvest date — stops auto-suggestion overwriting it. */
  harvestTouched: boolean;
};

export type CropRec = {
  cropName: string;
  suitabilityScore: number;
  confidenceScore: number;
  riskScore: "Low" | "Medium" | "High";
  pros: string[];
  cons: string[];
  estimatedYield: string;
  estimatedProfit: string;
};

export const SOIL_TYPES = [
  "Alluvial Soil",
  "Black Soil",
  "Red Soil",
  "Sandy Soil",
  "Clayey Soil",
];

// The old flat IRRIGATION_TYPES list is gone: it mixed sources and methods in
// one question, so answering it threw away whichever half the farmer did not
// pick. See irrigationCatalog.ts for what replaced it and why it matters.

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function makeFarm(): FarmDraft {
  // No defaults, for any of it. The old irrigation default ("Rain-fed") was a
  // real answer to a real question, pre-filled — so a farmer who never looked
  // at that field was recorded as having no irrigation at all, and the health
  // score docks points for exactly that.
  //
  // `soilType` carried the same bug and outlasted the fix: it defaulted to
  // "Alluvial Soil", which SoilPicker's own docstring explains is how the web
  // version ended up with 35 of 60 farms recorded as alluvial — "not an
  // answer, a form nobody opened". The picker was written to have no default
  // and this function was quietly supplying one. Every gate already requires
  // a truthy soilType, so an empty string is a question waiting to be
  // answered rather than a wrong answer on file.
  return { area: "", soilType: "", regime: "", source: "", method: "" };
}

export function makeSelection(): CropSelection {
  return {
    chosenCrop: "",
    customCrop: "",
    seedingDate: todayISO(),
    estimatedHarvestDate: "",
    harvestTouched: false,
  };
}

/** The crop a selection resolves to — a typed custom crop always wins. */
export function effectiveCrop(sel: CropSelection): string {
  return (sel.customCrop.trim() || sel.chosenCrop).trim();
}

type ProfileInput = {
  name: string;
  phone: string;
  email: string;
  location?: SelectedLocation;
  locationAddress: string;
  plan?: PlanId;
  planCycle?: Cycle;
};

/**
 * One profile per account. If registration runs again (a farmer adding a
 * second farm later), the existing profile is reused rather than duplicated —
 * same rule as the web app.
 */
export async function createFarmerProfile(profile: ProfileInput) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to create a profile.");

  const { data: existing } = await supabase
    .from("farmer_profiles")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  // The membership chosen at the plan step. Only written when registration
  // actually asked — an undefined plan must not quietly reset a farmer who
  // upgraded and then re-ran the wizard to add a field. `plan_cycle` is null
  // on the free tier because there is nothing being billed on a cycle.
  const planPatch = profile.plan
    ? {
        plan: profile.plan,
        plan_cycle: profile.plan === "free" ? null : (profile.planCycle ?? "annual"),
        plan_selected_at: new Date().toISOString(),
      }
    : {};

  if (existing) return existing;

  const { data, error } = await supabase
    .from("farmer_profiles")
    .insert([
      {
        owner_id: user.id,
        name: profile.name,
        phone: profile.phone,
        email: profile.email || user.email,
        house_lat: profile.location?.lat,
        house_lng: profile.location?.lng,
        house_address: profile.locationAddress,
        // The PIN rides in the preferences jsonb rather than its own column,
        // matching where the web app puts it (createFarmerProfile in the web
        // repo's src/lib/db.ts) so one account reads the same on both clients.
        preferences: profile.location?.pincode
          ? { house_pincode: profile.location.pincode }
          : {},
        ...planPatch,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Farm numbering continues from the farmer's existing farms. Numbering each
 * batch from 1 would give every registration run its own "Farm 1" — colliding
 * labels across the dashboard and, worse, colliding task keys.
 */
export async function createFarms(farmerId: string, farms: FarmDraft[]) {
  const { data: existing } = await supabase
    .from("farms")
    .select("farm_index")
    .eq("farmer_id", farmerId)
    .order("farm_index", { ascending: false })
    .limit(1);

  const startIndex = (existing?.[0]?.farm_index ?? 0) + 1;

  const base = farms.map((f, idx) => ({
    farmer_id: farmerId,
    farm_index: startIndex + idx,
    area: Number(f.area),
    soil_type: f.soilType,
    // The legacy composite stays populated: it is `not null`, and a dozen read
    // sites still take their wording from it. Two of those are behavioural —
    // isRainFed() and the health score's water factor both match
    // /rain[\s-]?fed/i against this string.
    irrigation: farmIrrigationLabel(f),
  }));

  // The split columns the irrigation engine computes with. They arrive in
  // migration 029, and PostgREST rejects an insert naming a column that does
  // not exist — so a phone running this build against an un-migrated database
  // would fail at the last step of registration, after the farmer has filled
  // in everything. Hence: try with them, fall back to the legacy shape. Same
  // guard as the web client's createFarms().
  const withSplit = base.map((row, idx) => ({
    ...row,
    ...(farms[idx].regime ? { water_regime: farms[idx].regime } : {}),
    ...(farms[idx].source ? { irrigation_source: farms[idx].source } : {}),
    ...(farms[idx].method ? { irrigation_method: farms[idx].method } : {}),
  }));

  const first = await supabase.from("farms").insert(withSplit).select();
  if (!first.error) return first.data ?? [];

  const missingColumn =
    first.error.code === "PGRST204" ||
    first.error.code === "42703" ||
    /water_regime|irrigation_source|irrigation_method/.test(first.error.message ?? "");

  if (!missingColumn) throw first.error;

  console.warn("farms: migration 029 not applied — writing the legacy irrigation column only");
  const { data, error } = await supabase.from("farms").insert(base).select();
  if (error) throw error;
  return data ?? [];
}

export async function createCropCycles(
  farmsInserted: { id: string; area: number }[],
  selections: CropSelection[]
) {
  const inserts = farmsInserted.map((farm, idx) => {
    const sel = selections[idx];
    const crop = effectiveCrop(sel);
    const area = Number(farm.area) || 0;
    // The farmer's own harvest date, per farm. Falls back to the agronomy
    // estimate so the dashboard countdown always has a date to work with.
    const harvestDate =
      sel.estimatedHarvestDate?.trim() ||
      (crop && sel.seedingDate ? suggestHarvestDate(crop, sel.seedingDate) : "") ||
      null;

    return {
      farm_id: farm.id,
      chosen_crop: crop,
      seeding_date: sel.seedingDate,
      estimated_harvest_date: harvestDate,
      expected_yield: crop ? estimateYieldLabel(crop, area) : null,
    };
  });

  const { error } = await supabase.from("crop_cycles").insert(inserts);
  if (error) throw error;
}

/**
 * Per-farm crop recommendations from the web app's AI route. The route needs
 * the Groq key server-side, so mobile calls it rather than duplicating the
 * engine; it is unauthenticated, so no token is needed.
 */
export async function fetchRecommendations(input: {
  locationAddress: string;
  /**
   * A measured pH per farm, when one exists. The route weighs it, so leaving
   * it out of a call made from the soil screen would ask "which crops suit
   * this pH" and then not send the pH.
   */
  farms: { area: number; soilType: string; irrigation: string; soilPh?: number }[];
  preferOilseed?: boolean;
}): Promise<CropRec[][]> {
  const res = await fetch(`${API_BASE_URL}/api/recommendations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, preferOilseed: input.preferOilseed ?? false }),
    signal: AbortSignal.timeout(45000),
  });

  const data = (await res.json()) as { farms?: CropRec[][]; error?: string };
  if (!res.ok) throw new Error(data?.error ?? "The recommendation engine failed.");
  return data.farms ?? [];
}

/** True once this account has a farmer profile — i.e. registration is done. */
export async function hasFarmerProfile(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("farmer_profiles")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  // The error was previously discarded, so a transient query failure returned
  // false — which the gate reads as "not registered" and marches an already
  // registered farmer back through onboarding. Throwing lets the caller tell
  // a real "no profile yet" apart from a lookup that did not happen.
  if (error) throw new Error(error.message);

  return Boolean(data);
}
