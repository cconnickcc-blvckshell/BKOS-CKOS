import { createClient } from "@/lib/supabase/server";

const cache = new Map<string, string>();

export async function getDecisionStatusId(code: string): Promise<string> {
  const cached = cache.get(code);
  if (cached) return cached;

  const supabase = await createClient();
  const { data } = await supabase
    .from("decision_statuses")
    .select("id")
    .eq("code", code)
    .single();

  if (!data?.id) throw new Error(`Decision status "${code}" not configured`);
  cache.set(code, data.id);
  return data.id;
}
