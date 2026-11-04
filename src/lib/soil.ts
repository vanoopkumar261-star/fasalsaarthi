import { File } from "expo-file-system";
import { API_BASE_URL } from "./apiBase";
import { authHeaders } from "./authHeaders";
import { supabase } from "./supabase";
import { getCropProfile } from "./agronomy";

export type PhReading = {
  id: string;
  ph: number;
  source: "photo" | "manual" | "sensor";
  note: string | null;
  created_at: string;
};

export type PhReadResult = { ph: number | null; confidence: number | null; error?: string };

/**
 * Reads the number off a photo of a handheld pH meter.
 *
 * Mirrors the web scanner exactly, including the part that matters: the route
 * deliberately does NOT persist. A misread pH is worse than no pH, so the value
 * comes back for the farmer to confirm on screen and only then gets written.
 */
export async function readPhFromPhoto(photoUri: string): Promise<PhReadResult> {
  if (!API_BASE_URL) return { ph: null, confidence: null, error: "No server configured." };
  try {
    const form = new FormData();
    // SDK 57's global fetch/FormData dropped support for the old
    // `{ uri, name, type }` form-data shape — appending one throws
    // "Unsupported FormDataPart implementation" at request time. Only an
    // actual Blob-like value works, which is what expo-file-system's File
    // class gives us. Same fix as voice.ts's transcribe().
    const file = new File(photoUri);
    form.append("image", file, "meter.jpg");

    const res = await fetch(`${API_BASE_URL}/api/soil-reading`, {
      method: "POST",
      body: form,
      // Content-Type is left unset so fetch supplies the multipart boundary.
      headers: await authHeaders(),
    });
    const json = await res.json();
    if (!res.ok) return { ph: null, confidence: null, error: json?.error ?? "Could not read the meter." };
    return { ph: json?.ph ?? null, confidence: json?.confidence ?? null };
  } catch (e) {
    console.error("SOIL read error:", e);
    return { ph: null, confidence: null, error: "Couldn't reach the reading service." };
  }
}

export async function saveReading(input: {
  farmerId: string;
  farmId?: string | null;
  ph: number;
  source: PhReading["source"];
  confidence?: number | null;
  note?: string | null;
}): Promise<boolean> {
  const { error } = await supabase.from("soil_readings").insert({
    farmer_id: input.farmerId,
    farm_id: input.farmId ?? null,
    ph: Math.round(input.ph * 10) / 10,
    source: input.source,
    ai_confidence: input.confidence ?? null,
    note: input.note?.trim() || null,
  });
  if (error) console.error("SOIL save error:", error.message);
  return !error;
}

export async function listReadings(farmerId: string, limit = 10): Promise<PhReading[]> {
  const { data, error } = await supabase
    .from("soil_readings")
    .select("id, ph, source, note, created_at")
    .eq("farmer_id", farmerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("SOIL list error:", error.message);
    return [];
  }
  return (data ?? []) as PhReading[];
}

/**
 * Where a crop actually wants to sit.
 *
 * This used to be a nine-crop table of its own, which had quietly drifted from
 * the one in agronomy.ts that the web app and `soilFix()` both read: it said
 * maize wanted 5.8-7.0 where agronomy says 5.5-7.5, and groundnut 6.0-6.5
 * against 6.0-7.0. The same farmer could therefore be told two different
 * things about the same field depending on which panel they were looking at.
 * There is one source now, and it covers 25 crops instead of 9.
 */
export function rangeForCrop(crop?: string | null): [number, number] {
  const profile = getCropProfile(crop ?? "");
  return [profile.phMin, profile.phMax];
}
