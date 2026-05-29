import { createClient } from "@/lib/supabase/server";
import { runSourceFetch } from "@/lib/acquisition/run-fetch";
import { normalizeSourceUrl } from "@/lib/acquisition/normalize-url";
import { assertTrustedUrl } from "@/lib/acquisition/trusted-domains";
import { getActiveStatusId } from "@/lib/status";
import { getCurationCampaignSourceStatusId } from "@/lib/curation/curation-status";
import { createNormalizationJobForExtraction } from "@/lib/curation/create-normalization-job";
import { syncCampaignOutputs } from "@/lib/curation/sync-campaign-outputs";
import { enqueueEmbeddingJob, processEmbeddingJob } from "@/lib/embeddings/queue";

function joinCode(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return (value[0] as { code?: string })?.code;
  return (value as { code?: string }).code;
}

function joinOne<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}

export async function fetchAllPendingCampaignUrls(campaignId: string, userId: string) {
  const supabase = await createClient();
  const fetchPendingId = await getCurationCampaignSourceStatusId("fetch_pending");
  const extractionReadyId = await getCurationCampaignSourceStatusId("extraction_ready");
  const fetchFailedId = await getCurationCampaignSourceStatusId("fetch_failed");

  const { data: rows } = await supabase
    .from("curation_campaign_sources")
    .select(
      `id, source_id, status_id,
       curation_campaign_source_statuses(code),
       sources(id, url, title)`
    )
    .eq("campaign_id", campaignId);

  const toFetch = (rows ?? []).filter((r) => {
    const code = joinCode(r.curation_campaign_source_statuses);
    return code === "pending" || code === "fetch_pending" || code === "fetch_failed";
  });

  const results: { sourceId: string; ok: boolean; error?: string }[] = [];

  for (const row of toFetch) {
    const source = joinOne<{ id: string; url: string | null; title: string }>(row.sources);
    if (!source?.url) {
      results.push({ sourceId: row.source_id, ok: false, error: "Source has no URL" });
      continue;
    }

    await supabase
      .from("curation_campaign_sources")
      .update({ status_id: fetchPendingId })
      .eq("id", row.id);

    const outcome = await runSourceFetch(source.id, userId, source.url);

    if (!outcome.ok) {
      await supabase
        .from("curation_campaign_sources")
        .update({
          status_id: fetchFailedId,
          notes: outcome.error,
          source_fetch_job_id: outcome.jobId ?? null,
        })
        .eq("id", row.id);
      results.push({ sourceId: row.source_id, ok: false, error: outcome.error });
      continue;
    }

    await supabase
      .from("curation_campaign_sources")
      .update({
        status_id: extractionReadyId,
        source_fetch_job_id: outcome.jobId,
        source_extraction_result_id: outcome.extractionId,
        notes: null,
      })
      .eq("id", row.id);

    results.push({ sourceId: row.source_id, ok: true });
  }

  return { fetched: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}

export async function createNormalizationJobsForCampaign(
  campaignId: string,
  userId: string,
  templateCode: string,
  domainCode: string
) {
  const supabase = await createClient();
  const normReadyId = await getCurationCampaignSourceStatusId("normalization_ready");

  const { data: rows } = await supabase
    .from("curation_campaign_sources")
    .select(
      `id, source_extraction_result_id, normalization_job_id,
       curation_campaign_source_statuses(code)`
    )
    .eq("campaign_id", campaignId);

  const eligible = (rows ?? []).filter((r) => {
    const code = joinCode(r.curation_campaign_source_statuses);
    return (
      r.source_extraction_result_id &&
      !r.normalization_job_id &&
      (code === "extraction_ready" || code === "fetched")
    );
  });

  let created = 0;
  const errors: string[] = [];

  for (const row of eligible) {
    const result = await createNormalizationJobForExtraction({
      extractionId: row.source_extraction_result_id as string,
      domainCode,
      templateCode,
      userId,
      campaignId,
    });

    if (!result.ok) {
      errors.push(result.error);
      continue;
    }

    await supabase
      .from("curation_campaign_sources")
      .update({
        normalization_job_id: result.jobId,
        status_id: normReadyId,
      })
      .eq("id", row.id);

    created++;
  }

  return { created, errors };
}

export async function processEmbeddingsForCampaign(campaignId: string, userId: string) {
  await syncCampaignOutputs(campaignId, userId);

  const supabase = await createClient();
  const embeddedStatusId = await getCurationCampaignSourceStatusId("embedded");

  const { data: outputs } = await supabase
    .from("curation_campaign_outputs")
    .select("entity_type, entity_id")
    .eq("campaign_id", campaignId)
    .eq("entity_type", "knowledge_record");

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const out of outputs ?? []) {
    const result = await enqueueEmbeddingJob({
      entityType: "knowledge_record",
      entityId: out.entity_id,
      userId,
      processImmediately: true,
      metadata: { curation_campaign_id: campaignId },
    });

    if (result.skipped && !result.jobId) {
      skipped++;
      continue;
    }

    if (result.jobId && !result.processed) {
      const proc = await processEmbeddingJob(result.jobId, userId);
      if (!proc.ok) {
        errors.push(proc.error ?? "Embedding failed");
        continue;
      }
    }

    processed++;

    const { data: sources } = await supabase
      .from("curation_campaign_sources")
      .select("id, normalization_job_id")
      .eq("campaign_id", campaignId)
      .not("normalization_job_id", "is", null);

    for (const cs of sources ?? []) {
      await supabase
        .from("curation_campaign_sources")
        .update({ status_id: embeddedStatusId })
        .eq("id", cs.id);
    }
  }

  return { processed, skipped, errors };
}

export async function addUrlToCampaign(options: {
  campaignId: string;
  url: string;
  userId: string;
  title?: string;
  sourceTypeId: string;
  domainId: string;
}) {
  const supabase = await createClient();
  const normalized = normalizeSourceUrl(options.url);

  const { data: trustedRows } = await supabase
    .from("trusted_source_domains")
    .select("id, domain, label, is_active, allow_subdomains")
    .eq("is_active", true);

  try {
    assertTrustedUrl(normalized, trustedRows ?? []);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Untrusted domain" };
  }

  const entityStatusId = await getActiveStatusId();
  const pendingSourceStatusId = await getCurationCampaignSourceStatusId("pending");

  const { data: existingSource } = await supabase
    .from("sources")
    .select("id")
    .eq("url", normalized)
    .maybeSingle();

  let sourceId = existingSource?.id;

  if (!sourceId) {
    const { data: source, error: createErr } = await supabase
      .from("sources")
      .insert({
        title: options.title?.trim() || new URL(normalized).hostname,
        url: normalized,
        source_type_id: options.sourceTypeId,
        domain_id: options.domainId,
        created_by: options.userId,
        status: entityStatusId,
      })
      .select("id")
      .single();

    if (createErr || !source) {
      return { ok: false as const, error: createErr?.message ?? "Failed to create source" };
    }
    sourceId = source.id;
  }

  const { count } = await supabase
    .from("curation_campaign_sources")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", options.campaignId);

  const { data: link, error: linkErr } = await supabase
    .from("curation_campaign_sources")
    .insert({
      campaign_id: options.campaignId,
      source_id: sourceId,
      status_id: pendingSourceStatusId,
      sort_order: count ?? 0,
      created_by: options.userId,
      status: entityStatusId,
    })
    .select("id")
    .single();

  if (linkErr) {
    if (linkErr.code === "23505") {
      return { ok: false as const, error: "URL already in this campaign" };
    }
    return { ok: false as const, error: linkErr.message };
  }

  return { ok: true as const, campaignSourceId: link!.id, sourceId };
}
