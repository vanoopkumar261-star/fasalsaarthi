import { File } from "expo-file-system";
import { API_BASE_URL } from "./apiBase";
import { authHeaders } from "./authHeaders";
import { supabase } from "./supabase";
import { isUnlimited, limitOf, type PlanId } from "./plans";

export type DiseaseResult = {
  source: "model" | "vision";
  crop: string;
  disease: string;
  healthy: boolean;
  confidence: number;
  severity: "Low" | "Medium" | "High";
  affectedAreaPct: number;
  summary: string;
  treatment: { organic: string[]; chemical: string[] };
  recovery: string;
  prevention: string[];
  note?: string;
  error?: string;
};

/**
 * Uploads a leaf photo to the web app's /api/disease (same route the web
 * scanner uses — hybrid CNN classifier + Groq narrative, Groq vision
 * fallback). The Bearer token identifies the farmer, so the diagnosis and its
 * photo are persisted to their scan history and show up on the web dashboard
 * too.
 */
export async function diagnoseLeaf(photoUri: string): Promise<DiseaseResult | null> {
  if (!API_BASE_URL) return null;
  try {
    const form = new FormData();
    // SDK 57's global fetch/FormData dropped support for the old
    // `{ uri, name, type }` form-data shape — appending one throws
    // "Unsupported FormDataPart implementation" at request time. Only an
    // actual Blob-like value works, which is what expo-file-system's File
    // class gives us. Same fix as voice.ts's transcribe().
    const file = new File(photoUri);
    form.append("image", file, "leaf.jpg");

    const res = await fetch(`${API_BASE_URL}/api/disease`, {
      method: "POST",
      body: form,
      // Content-Type is deliberately unset: fetch derives it from the FormData
      // body, including the multipart boundary the server needs to split the
      // parts. Setting it by hand omits that boundary.
      headers: await authHeaders(),
    });
    const json = await res.json();
    if (!res.ok) return { error: json?.error ?? "Diagnosis failed." } as DiseaseResult;
    return json as DiseaseResult;
  } catch (e) {
    console.error("DISEASE error:", e);
    return { error: "Couldn't reach the diagnosis service." } as DiseaseResult;
  }
}

/** One saved scan, as the history list renders it. */
export type DiagnosisRecord = {
  id: string;
  crop_name: string | null;
  disease: string | null;
  healthy: boolean | null;
  confidence: number | null;
  severity: string | null;
  summary: string | null;
  source: string | null;
  image_url: string | null;
  created_at: string;
};

/**
 * How far back this tier can see, or null for no limit.
 *
 * Nothing is deleted when a record passes the window — it stays in the table
 * and reappears if the farmer moves up a tier. A plan that destroyed history
 * would be a plan farmers could not safely leave.
 */
export function historyCutoff(plan: PlanId, now: Date = new Date()): Date | null {
  const days = limitOf(plan, "historyDays");
  if (isUnlimited(days)) return null;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Past scans for this farmer.
 *
 * The scans were already being written — /api/disease persists them against
 * the Bearer token, and they have been showing up on the web dashboard all
 * along. They were simply never read back on the phone, so a farmer could
 * photograph the same leaf twice and never see what they were told the first
 * time. Read through the app's own client, so RLS scopes it to the owner.
 */
export async function getRecentDiagnoses(
  farmerId: string,
  limit = 10,
  since?: Date | null
): Promise<DiagnosisRecord[]> {
  try {
    let q = supabase
      .from("crop_health_records")
      .select("id, crop_name, disease, healthy, confidence, severity, summary, source, image_url, created_at")
      .eq("farmer_id", farmerId);
    if (since) q = q.gte("created_at", since.toISOString());
    const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
    if (error || !data) return [];
    return data as DiagnosisRecord[];
  } catch {
    // The table may not exist on an un-migrated project; an empty history is
    // the honest answer, and the scanner above still works.
    return [];
  }
}
