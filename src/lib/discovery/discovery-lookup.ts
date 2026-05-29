import { createClient } from "@/lib/supabase/server";

const statusCache = new Map<string, string>();
const sourceCache = new Map<string, string>();

export async function getDiscoveryStatusId(code: string): Promise<string> {
  const cached = statusCache.get(code);
  if (cached) return cached;

  const supabase = await createClient();
  const { data } = await supabase
    .from("discovery_statuses")
    .select("id")
    .eq("code", code)
    .single();

  if (!data?.id) throw new Error(`Discovery status "${code}" not configured`);
  statusCache.set(code, data.id);
  return data.id;
}

export async function getDiscoverySuggestionSourceId(code: string): Promise<string> {
  const cached = sourceCache.get(code);
  if (cached) return cached;

  const supabase = await createClient();
  const { data } = await supabase
    .from("discovery_suggestion_sources")
    .select("id")
    .eq("code", code)
    .single();

  if (!data?.id) throw new Error(`Discovery suggestion source "${code}" not configured`);
  sourceCache.set(code, data.id);
  return data.id;
}
