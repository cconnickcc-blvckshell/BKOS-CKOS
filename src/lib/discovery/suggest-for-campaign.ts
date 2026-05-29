import { createClient } from "@/lib/supabase/server";
import { buildSuggestionsForGap, persistSuggestionsForGap } from "@/lib/discovery/suggest-for-gap";

export async function suggestSourcesForCampaign(campaignId: string, userId: string) {
  const supabase = await createClient();

  const { data: links } = await supabase
    .from("campaign_gap_links")
    .select("knowledge_gap_id")
    .eq("campaign_id", campaignId);

  let gapIds = (links ?? []).map((l) => l.knowledge_gap_id);

  if (gapIds.length === 0) {
    const { data: direct } = await supabase
      .from("knowledge_gaps")
      .select("id")
      .eq("campaign_id", campaignId);
    gapIds = (direct ?? []).map((g) => g.id);
  }

  const { data: openStatuses } = await supabase
    .from("gap_statuses")
    .select("id")
    .in("code", ["open", "investigating", "source_needed", "normalization_needed"]);

  const openIds = new Set((openStatuses ?? []).map((s) => s.id));

  let totalCreated = 0;
  let totalUpdated = 0;
  const allIds: string[] = [];

  for (const gapId of gapIds) {
    const { data: gap } = await supabase
      .from("knowledge_gaps")
      .select("status_id")
      .eq("id", gapId)
      .single();

    if (gap && !openIds.has(gap.status_id)) continue;

    const drafts = await buildSuggestionsForGap(gapId);
    const result = await persistSuggestionsForGap(gapId, userId, drafts);
    totalCreated += result.created;
    totalUpdated += result.updated;
    allIds.push(...result.suggestionIds);
  }

  return {
    gapsProcessed: gapIds.length,
    created: totalCreated,
    updated: totalUpdated,
    suggestionIds: allIds,
  };
}
