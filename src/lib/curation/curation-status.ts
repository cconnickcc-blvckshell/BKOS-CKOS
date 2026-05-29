import { createClient } from "@/lib/supabase/server";

const campaignCache = new Map<string, string>();
const sourceCache = new Map<string, string>();

export async function getCurationCampaignStatusId(code: string): Promise<string> {
  const cached = campaignCache.get(code);
  if (cached) return cached;

  const supabase = await createClient();
  const { data } = await supabase
    .from("curation_campaign_statuses")
    .select("id")
    .eq("code", code)
    .single();

  if (!data?.id) throw new Error(`Curation campaign status "${code}" not configured`);
  campaignCache.set(code, data.id);
  return data.id;
}

export async function getCurationCampaignSourceStatusId(code: string): Promise<string> {
  const cached = sourceCache.get(code);
  if (cached) return cached;

  const supabase = await createClient();
  const { data } = await supabase
    .from("curation_campaign_source_statuses")
    .select("id")
    .eq("code", code)
    .single();

  if (!data?.id) throw new Error(`Curation campaign source status "${code}" not configured`);
  sourceCache.set(code, data.id);
  return data.id;
}
