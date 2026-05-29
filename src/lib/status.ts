import { createClient } from "@/lib/supabase/server";

const statusCache = new Map<string, string>();

export async function getStatusIdByCode(code: string): Promise<string> {
  const key = `entity:${code}`;
  const cached = statusCache.get(key);
  if (cached) return cached;

  const supabase = await createClient();
  const { data } = await supabase
    .from("status_types")
    .select("id")
    .eq("domain", "entity")
    .eq("code", code)
    .single();

  if (!data?.id) throw new Error(`Status "${code}" not configured in database`);
  statusCache.set(key, data.id);
  return data.id;
}

let cachedActiveStatusId: string | null = null;

export async function getActiveStatusId(): Promise<string> {
  if (cachedActiveStatusId) return cachedActiveStatusId;

  const supabase = await createClient();
  const { data } = await supabase
    .from("status_types")
    .select("id")
    .eq("domain", "entity")
    .eq("code", "active")
    .single();

  if (!data?.id) throw new Error("Active status not configured in database");
  cachedActiveStatusId = data.id;
  return data.id;
}
