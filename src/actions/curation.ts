"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { writeAudit } from "@/lib/audit";
import { getCurationCampaignStatusId } from "@/lib/curation/curation-status";
import { computeCampaignMetrics } from "@/lib/curation/campaign-metrics";
import { syncCampaignOutputs } from "@/lib/curation/sync-campaign-outputs";
import {
  addUrlToCampaign,
  createNormalizationJobsForCampaign,
  fetchAllPendingCampaignUrls,
  processEmbeddingsForCampaign,
} from "@/lib/curation/campaign-batch";
import { z } from "zod";

export async function listCurationCampaignStatuses() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("curation_campaign_statuses")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listCurationCampaigns(limit = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("curation_campaigns")
    .select(
      `*,
      curation_campaign_statuses(id, code, label),
      knowledge_domains(id, code, label)`
    )
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getCurationCampaign(campaignId: string) {
  const supabase = await createClient();
  const { data: campaign, error } = await supabase
    .from("curation_campaigns")
    .select(
      `*,
      curation_campaign_statuses(id, code, label),
      knowledge_domains(id, code, label)`
    )
    .eq("id", campaignId)
    .single();

  if (error || !campaign) throw new Error("Campaign not found");

  const { data: sources } = await supabase
    .from("curation_campaign_sources")
    .select(
      `*,
      curation_campaign_source_statuses(id, code, label),
      sources(id, title, url),
      source_fetch_jobs(id, status_id, acquisition_statuses(code, label)),
      source_extraction_results(id, title),
      normalization_jobs(id, status_id, normalization_statuses(code, label))`
    )
    .eq("campaign_id", campaignId)
    .order("sort_order");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await syncCampaignOutputs(campaignId, user.id);
  }

  const { data: outputs } = await supabase
    .from("curation_campaign_outputs")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  const sourceRows = (sources ?? []).map((s) => ({
    id: s.id,
    status_id: s.status_id as string,
    curation_campaign_source_statuses: s.curation_campaign_source_statuses as {
      code: string;
      label: string;
    } | null,
    source_fetch_job_id: s.source_fetch_job_id as string | null,
    source_extraction_result_id: s.source_extraction_result_id as string | null,
    normalization_job_id: s.normalization_job_id as string | null,
  }));

  const approvedKnowledge = (outputs ?? []).filter(
    (o) => o.entity_type === "knowledge_record" && o.output_role === "approved_knowledge"
  ).length;

  const embeddedCount = (sources ?? []).filter(
    (s) =>
      (s.curation_campaign_source_statuses as { code: string } | null)?.code === "embedded"
  ).length;

  const metrics = computeCampaignMetrics(sourceRows, approvedKnowledge, embeddedCount);

  return {
    campaign,
    sources: sources ?? [],
    outputs: outputs ?? [],
    metrics,
  };
}

const campaignSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  objective: z.string().optional(),
  domain_code: z.string().min(1),
  status_code: z.string().optional(),
  target_entities: z.string().optional(),
  target_topics: z.string().optional(),
});

function parseJsonField(raw: string | undefined, fallback: unknown) {
  if (!raw?.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function createCurationCampaign(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = campaignSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    objective: formData.get("objective") || undefined,
    domain_code: formData.get("domain_code"),
    status_code: formData.get("status_code") || "draft",
    target_entities: formData.get("target_entities") || undefined,
    target_topics: formData.get("target_topics") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.message };

  const { data: domain } = await supabase
    .from("knowledge_domains")
    .select("id")
    .eq("code", parsed.data.domain_code)
    .single();

  if (!domain) return { error: "Invalid domain" };

  const statusId = await getCurationCampaignStatusId(parsed.data.status_code ?? "draft");
  const entityStatusId = await getActiveStatusId();

  const templateCode =
    (formData.get("default_template_code") as string)?.trim() || "concept_card";

  const { data: campaign, error } = await supabase
    .from("curation_campaigns")
    .insert({
      domain_id: domain.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      objective: parsed.data.objective ?? null,
      status_id: statusId,
      target_entities: parseJsonField(parsed.data.target_entities, []),
      target_topics: parseJsonField(parsed.data.target_topics, []),
      metadata: { default_template_code: templateCode },
      created_by: user.id,
      status: entityStatusId,
    })
    .select("id")
    .single();

  if (error || !campaign) return { error: error?.message ?? "Create failed" };

  await writeAudit("curation_campaign_create", "curation_campaign", campaign.id, {
    title: parsed.data.title,
    domain_code: parsed.data.domain_code,
  });

  revalidatePath("/curation");
  return { ok: true, campaignId: campaign.id };
}

export async function updateCurationCampaign(campaignId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = campaignSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    objective: formData.get("objective") || undefined,
    domain_code: formData.get("domain_code"),
    status_code: formData.get("status_code") || undefined,
    target_entities: formData.get("target_entities") || undefined,
    target_topics: formData.get("target_topics") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.message };

  const { data: domain } = await supabase
    .from("knowledge_domains")
    .select("id")
    .eq("code", parsed.data.domain_code)
    .single();

  if (!domain) return { error: "Invalid domain" };

  const updates: Record<string, unknown> = {
    domain_id: domain.id,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    objective: parsed.data.objective ?? null,
    target_entities: parseJsonField(parsed.data.target_entities, []),
    target_topics: parseJsonField(parsed.data.target_topics, []),
  };

  if (parsed.data.status_code) {
    updates.status_id = await getCurationCampaignStatusId(parsed.data.status_code);
  }

  const templateCode = (formData.get("default_template_code") as string)?.trim();
  if (templateCode) {
    const { data: existing } = await supabase
      .from("curation_campaigns")
      .select("metadata")
      .eq("id", campaignId)
      .single();
    updates.metadata = {
      ...((existing?.metadata as Record<string, unknown>) ?? {}),
      default_template_code: templateCode,
    };
  }

  const { error } = await supabase
    .from("curation_campaigns")
    .update(updates)
    .eq("id", campaignId);

  if (error) return { error: error.message };

  revalidatePath("/curation");
  revalidatePath(`/curation/${campaignId}`);
  return { ok: true };
}

export async function addCampaignUrl(campaignId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const url = (formData.get("url") as string)?.trim();
  const sourceTypeId = formData.get("source_type_id") as string;
  const title = (formData.get("title") as string)?.trim();

  if (!url) return { error: "URL required" };
  if (!sourceTypeId) return { error: "Source type required" };

  const { data: campaign } = await supabase
    .from("curation_campaigns")
    .select("domain_id")
    .eq("id", campaignId)
    .single();

  if (!campaign) return { error: "Campaign not found" };

  const result = await addUrlToCampaign({
    campaignId,
    url,
    userId: user.id,
    title,
    sourceTypeId,
    domainId: campaign.domain_id,
  });

  if (!result.ok) return { error: result.error };

  await writeAudit("curation_campaign_add_url", "curation_campaign", campaignId, {
    source_id: result.sourceId,
  });

  revalidatePath(`/curation/${campaignId}`);
  return { ok: true, sourceId: result.sourceId };
}

export async function fetchCampaignPendingUrls(campaignId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const result = await fetchAllPendingCampaignUrls(campaignId, user.id);
  revalidatePath(`/curation/${campaignId}`);
  return { ok: true, ...result };
}

export async function createCampaignNormalizationJobs(campaignId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: campaign } = await supabase
    .from("curation_campaigns")
    .select("metadata, domain_id, knowledge_domains(code)")
    .eq("id", campaignId)
    .single();

  if (!campaign) return { error: "Campaign not found" };

  const domainRow = campaign.knowledge_domains as { code: string } | { code: string }[] | null;
  const domainCode = Array.isArray(domainRow) ? domainRow[0]?.code : domainRow?.code;
  if (!domainCode) return { error: "Campaign domain not found" };
  const metadata = campaign.metadata as { default_template_code?: string };
  const templateCode = metadata.default_template_code ?? "concept_card";

  const result = await createNormalizationJobsForCampaign(
    campaignId,
    user.id,
    templateCode,
    domainCode
  );

  revalidatePath(`/curation/${campaignId}`);
  revalidatePath("/normalization");
  return { ok: true, ...result };
}

export async function processCampaignEmbeddings(campaignId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const result = await processEmbeddingsForCampaign(campaignId, user.id);
  revalidatePath(`/curation/${campaignId}`);
  revalidatePath("/embeddings");
  revalidatePath("/search");
  return { ok: true, ...result };
}

export async function listSourceTypesForCampaign() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("source_types").select("*").order("label");
  if (error) throw new Error(error.message);
  return data ?? [];
}
