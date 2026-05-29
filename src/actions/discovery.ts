"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getDiscoveryStatusId } from "@/lib/discovery/discovery-lookup";
import {
  buildSuggestionsForGap,
  persistSuggestionsForGap,
} from "@/lib/discovery/suggest-for-gap";
import { suggestSourcesForCampaign } from "@/lib/discovery/suggest-for-campaign";
import { addUrlToCampaign } from "@/lib/curation/campaign-batch";
import { z } from "zod";

export async function listDiscoveryStatuses() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("discovery_statuses")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listDiscoverySuggestions(limit = 100) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_discovery_suggestions")
    .select(
      `*,
      discovery_statuses(id, code, label),
      discovery_suggestion_sources(id, code, label),
      trusted_source_domains(id, domain, label),
      knowledge_domains(id, code, label),
      knowledge_gaps(id, title),
      curation_campaigns(id, title)`
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listDiscoverySuggestionsForGap(gapId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_discovery_suggestions")
    .select(
      `*,
      discovery_statuses(id, code, label),
      discovery_suggestion_sources(id, code, label),
      trusted_source_domains(id, domain, label)`
    )
    .eq("knowledge_gap_id", gapId)
    .order("confidence_score", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listDiscoverySuggestionsForCampaign(campaignId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_discovery_suggestions")
    .select(
      `*,
      discovery_statuses(id, code, label),
      discovery_suggestion_sources(id, code, label),
      trusted_source_domains(id, domain, label),
      knowledge_gaps(id, title, gap_types(code, label))`
    )
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function runGapSourceSuggestions(gapId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  try {
    const drafts = await buildSuggestionsForGap(gapId);
    const result = await persistSuggestionsForGap(gapId, user.id, drafts);
    revalidatePath(`/gaps/${gapId}`);
    revalidatePath("/discovery");
    if (result.suggestionIds.length) {
      const { data: gap } = await supabase
        .from("knowledge_gaps")
        .select("campaign_id")
        .eq("id", gapId)
        .single();
      if (gap?.campaign_id) revalidatePath(`/curation/${gap.campaign_id}`);
    }
    return { ok: true, ...result, detected: drafts.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Suggestion failed" };
  }
}

export async function runCampaignSourceSuggestions(campaignId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  try {
    const result = await suggestSourcesForCampaign(campaignId, user.id);
    revalidatePath(`/curation/${campaignId}`);
    revalidatePath("/discovery");
    revalidatePath("/gaps");
    return { ok: true, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Suggestion failed" };
  }
}

async function setSuggestionStatus(suggestionId: string, statusCode: string) {
  const supabase = await createClient();
  const statusId = await getDiscoveryStatusId(statusCode);

  const { data, error } = await supabase
    .from("source_discovery_suggestions")
    .update({ status_id: statusId })
    .eq("id", suggestionId)
    .select("knowledge_gap_id, campaign_id")
    .single();

  if (error) return { error: error.message };

  await writeAudit("discovery_suggestion_status", "source_discovery_suggestion", suggestionId, {
    status: statusCode,
  });

  revalidatePath("/discovery");
  if (data?.knowledge_gap_id) revalidatePath(`/gaps/${data.knowledge_gap_id}`);
  if (data?.campaign_id) revalidatePath(`/curation/${data.campaign_id}`);

  return { ok: true };
}

export async function approveDiscoverySuggestion(suggestionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  return setSuggestionStatus(suggestionId, "approved");
}

export async function rejectDiscoverySuggestion(suggestionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  return setSuggestionStatus(suggestionId, "rejected");
}

export async function dismissDiscoverySuggestion(suggestionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  return setSuggestionStatus(suggestionId, "dismissed");
}

export async function addApprovedSuggestionToCampaign(suggestionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: suggestion, error } = await supabase
    .from("source_discovery_suggestions")
    .select(
      `*,
      discovery_statuses(code),
      discovery_suggestion_sources(code)`
    )
    .eq("id", suggestionId)
    .single();

  if (error || !suggestion) return { error: "Suggestion not found" };

  const statusCode = (suggestion.discovery_statuses as { code: string }).code;
  if (statusCode !== "approved") {
    return { error: "Approve the suggestion before adding it to a campaign." };
  }

  const campaignId = suggestion.campaign_id as string | null;
  if (!campaignId) {
    const gapId = suggestion.knowledge_gap_id as string | null;
    if (gapId) {
      const { data: gap } = await supabase
        .from("knowledge_gaps")
        .select("campaign_id, domain_id")
        .eq("id", gapId)
        .single();
      if (!gap?.campaign_id) {
        return { error: "Suggestion is not linked to a campaign" };
      }
      return addApprovedSuggestionToCampaignWithCampaign(
        suggestion,
        gap.campaign_id,
        gap.domain_id,
        user.id
      );
    }
    return { error: "No campaign linked to this suggestion" };
  }

  return addApprovedSuggestionToCampaignWithCampaign(
    suggestion,
    campaignId,
    suggestion.domain_id,
    user.id
  );
}

async function addApprovedSuggestionToCampaignWithCampaign(
  suggestion: {
    id: string;
    suggested_url: string;
    normalized_url: string;
    title: string | null;
    domain_id: string;
  },
  campaignId: string,
  domainId: string,
  userId: string
) {
  const supabase = await createClient();

  const { data: wikiType } = await supabase
    .from("source_types")
    .select("id")
    .eq("code", "wiki")
    .maybeSingle();

  const { data: docType } = await supabase
    .from("source_types")
    .select("id")
    .eq("code", "documentation")
    .maybeSingle();

  const sourceTypeId = wikiType?.id ?? docType?.id;
  if (!sourceTypeId) return { error: "No source type configured" };

  const result = await addUrlToCampaign({
    campaignId,
    url: suggestion.suggested_url,
    userId,
    title: suggestion.title ?? undefined,
    sourceTypeId,
    domainId,
  });

  if (!result.ok) return { error: result.error };

  const addedId = await getDiscoveryStatusId("added_to_campaign");
  await supabase
    .from("source_discovery_suggestions")
    .update({ status_id: addedId })
    .eq("id", suggestion.id);

  await writeAudit("discovery_suggestion_add_campaign", "source_discovery_suggestion", suggestion.id, {
    campaign_id: campaignId,
    source_id: result.sourceId,
  });

  revalidatePath(`/curation/${campaignId}`);
  revalidatePath("/discovery");

  return { ok: true, sourceId: result.sourceId, campaignSourceId: result.campaignSourceId };
}

const manualSuggestionSchema = z.object({
  suggested_url: z.string().url(),
  title: z.string().optional(),
  reason: z.string().min(10),
  knowledge_gap_id: z.string().uuid().optional(),
  campaign_id: z.string().uuid().optional(),
});

export async function createManualDiscoverySuggestion(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = manualSuggestionSchema.safeParse({
    suggested_url: formData.get("suggested_url"),
    title: formData.get("title") || undefined,
    reason: formData.get("reason"),
    knowledge_gap_id: formData.get("knowledge_gap_id") || undefined,
    campaign_id: formData.get("campaign_id") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.message };
  if (!parsed.data.knowledge_gap_id && !parsed.data.campaign_id) {
    return { error: "Link to a gap or campaign required" };
  }

  const { normalizeSourceUrl } = await import("@/lib/acquisition/normalize-url");
  const { assertTrustedUrl } = await import("@/lib/acquisition/trusted-domains");

  let normalized: string;
  try {
    normalized = normalizeSourceUrl(parsed.data.suggested_url);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid URL" };
  }

  const { data: trustedRows } = await supabase
    .from("trusted_source_domains")
    .select("id, domain, label, is_active, allow_subdomains")
    .eq("is_active", true);

  let trusted;
  try {
    trusted = assertTrustedUrl(normalized, trustedRows ?? []);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Untrusted domain" };
  }

  let domainId: string | null = null;
  if (parsed.data.campaign_id) {
    const { data: c } = await supabase
      .from("curation_campaigns")
      .select("domain_id")
      .eq("id", parsed.data.campaign_id)
      .single();
    domainId = c?.domain_id ?? null;
  } else if (parsed.data.knowledge_gap_id) {
    const { data: g } = await supabase
      .from("knowledge_gaps")
      .select("domain_id, campaign_id")
      .eq("id", parsed.data.knowledge_gap_id)
      .single();
    domainId = g?.domain_id ?? null;
  }

  if (!domainId) return { error: "Could not resolve domain" };

  const drafts = [
    {
      suggested_url: parsed.data.suggested_url,
      normalized_url: normalized,
      title: parsed.data.title ?? new URL(normalized).hostname,
      reason: parsed.data.reason,
      confidence_score: 0.9,
      trusted_domain_id: trusted.id,
      suggestion_source_code: "manual",
    },
  ];

  if (parsed.data.knowledge_gap_id) {
    const result = await persistSuggestionsForGap(
      parsed.data.knowledge_gap_id,
      user.id,
      drafts
    );
    revalidatePath("/discovery");
    return { ok: true, ...result };
  }

  const proposedId = await getDiscoveryStatusId("proposed");
  const manualSourceId = await import("@/lib/discovery/discovery-lookup").then((m) =>
    m.getDiscoverySuggestionSourceId("manual")
  );
  const { getActiveStatusId } = await import("@/lib/status");
  const entityStatusId = await getActiveStatusId();

  const { data: row, error } = await supabase
    .from("source_discovery_suggestions")
    .insert({
      domain_id: domainId,
      campaign_id: parsed.data.campaign_id,
      suggested_url: parsed.data.suggested_url,
      normalized_url: normalized,
      title: parsed.data.title ?? new URL(normalized).hostname,
      reason: parsed.data.reason,
      confidence_score: 0.9,
      trusted_domain_id: trusted.id,
      suggestion_source_id: await manualSourceId,
      status_id: proposedId,
      created_by: user.id,
      status: entityStatusId,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/discovery");
  return { ok: true, created: 1, suggestionIds: [row!.id] };
}
