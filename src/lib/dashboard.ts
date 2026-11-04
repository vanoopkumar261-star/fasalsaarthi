import { supabase } from "./supabase";

/**
 * Client-side equivalent of the web app's src/lib/dashboard.ts
 * (getDashboardData). The web version runs server-side via
 * createSupabaseServer() and a cookie session; here the mobile app's own
 * signed-in Supabase client reads the same tables directly — RLS (owner_id =
 * auth.uid()) enforces the same per-farmer scoping either way, so no backend
 * change was needed for this read.
 */

export type FarmerProfile = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  house_lat: number | null;
  house_lng: number | null;
  house_address: string | null;
  created_at: string | null;
  preferences?: Record<string, any> | null;
};

export type FarmRow = {
  id: string;
  farmer_id: string;
  farm_index: number;
  area: number;
  soil_type: string;
  irrigation: string;
};

export type CropCycleRow = {
  id: string;
  farm_id: string;
  chosen_crop: string;
  seeding_date: string;
  estimated_harvest_date: string | null;
  expected_yield: string | null;
  created_at?: string | null;
};

export type FarmWithCrop = FarmRow & { crop: CropCycleRow | null };

export type DashboardData = {
  farmer: FarmerProfile | null;
  farms: FarmWithCrop[];
};

export async function getDashboardData(): Promise<DashboardData> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { farmer: null, farms: [] };

  const { data, error } = await supabase
    .from("farmer_profiles")
    .select("*, farms(*, crop_cycles(*))")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("DASHBOARD error:", error);
    return { farmer: null, farms: [] };
  }
  if (!data) return { farmer: null, farms: [] };

  const { farms: rawFarms, ...farmer } = data as any;

  const farms: FarmWithCrop[] = ((rawFarms ?? []) as any[])
    .map((f) => {
      const cycles = (f.crop_cycles ?? []) as CropCycleRow[];
      const { crop_cycles, ...farmRow } = f;
      return { ...(farmRow as FarmRow), crop: cycles[0] ?? null };
    })
    .sort((a, b) => a.farm_index - b.farm_index);

  return { farmer: farmer as FarmerProfile, farms };
}
