import { createClient } from "@/lib/supabase/server";

const cache = new Map<string, string>();

export async function getAcquisitionStatusId(code: string): Promise<string> {
  const cached = cache.get(code);
  if (cached) return cached;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acquisition_statuses")
    .select("id")
    .eq("code", code)
    .single();

  if (error || !data?.id) {
    throw new Error(`Acquisition status "${code}" not configured`);
  }
  cache.set(code, data.id);
  return data.id;
}
