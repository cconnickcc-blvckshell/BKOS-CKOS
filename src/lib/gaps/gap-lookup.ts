import { createClient } from "@/lib/supabase/server";

const statusCache = new Map<string, string>();
const severityCache = new Map<string, string>();
const typeCache = new Map<string, { id: string; default_severity_code: string | null }>();

export async function getGapStatusId(code: string): Promise<string> {
  const cached = statusCache.get(code);
  if (cached) return cached;
  const supabase = await createClient();
  const { data } = await supabase.from("gap_statuses").select("id").eq("code", code).single();
  if (!data?.id) throw new Error(`Gap status "${code}" not configured`);
  statusCache.set(code, data.id);
  return data.id;
}

export async function getGapSeverityId(code: string): Promise<string> {
  const cached = severityCache.get(code);
  if (cached) return cached;
  const supabase = await createClient();
  const { data } = await supabase
    .from("gap_severity_levels")
    .select("id")
    .eq("code", code)
    .single();
  if (!data?.id) throw new Error(`Gap severity "${code}" not configured`);
  severityCache.set(code, data.id);
  return data.id;
}

export async function getGapType(code: string) {
  const cached = typeCache.get(code);
  if (cached) return cached;
  const supabase = await createClient();
  const { data } = await supabase
    .from("gap_types")
    .select("id, code, default_severity_code")
    .eq("code", code)
    .single();
  if (!data?.id) throw new Error(`Gap type "${code}" not configured`);
  const row = { id: data.id, default_severity_code: data.default_severity_code as string | null };
  typeCache.set(code, row);
  return row;
}
