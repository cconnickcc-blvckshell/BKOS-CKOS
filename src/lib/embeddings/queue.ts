import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { writeAudit } from "@/lib/audit";
import { getEmbeddingStatusId } from "@/lib/embeddings/embedding-status";
import { buildEmbeddableContent, isEmbeddableEntityType } from "@/lib/embeddings/content";
import { hashEmbeddableContent, estimateTokens } from "@/lib/embeddings/hash";
import {
  generateEmbeddingWithMeta,
  getEmbeddingRuntimeConfig,
  isEmbeddingProviderEnabled,
  getEmbeddingProviderStatusMessage,
} from "@/lib/providers/embedding";

export type EnqueueResult = {
  jobId?: string;
  skipped?: boolean;
  reason?: string;
  processed?: boolean;
};

async function getActiveModelConfig() {
  const runtime = getEmbeddingRuntimeConfig();
  if (!runtime.enabled) return null;

  const providerKey =
    runtime.kind === "openai_compatible"
      ? "openai_compatible"
      : runtime.kind;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("embedding_model_configs")
    .select("*")
    .eq("provider", providerKey)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function enqueueEmbeddingJob(options: {
  entityType: string;
  entityId: string;
  userId?: string | null;
  forceRebuild?: boolean;
  metadata?: Record<string, unknown>;
  processImmediately?: boolean;
}): Promise<EnqueueResult> {
  if (!isEmbeddableEntityType(options.entityType)) {
    return { skipped: true, reason: `Unsupported entity type: ${options.entityType}` };
  }

  const built = await buildEmbeddableContent(options.entityType, options.entityId);
  if (!built || !built.text.trim()) {
    return { skipped: true, reason: "No embeddable content" };
  }

  const contentHash = hashEmbeddableContent(built.text);
  const supabase = await createClient();
  if (!isEmbeddingProviderEnabled()) {
    return {
      skipped: true,
      reason:
        getEmbeddingProviderStatusMessage() || "Embedding provider disabled",
    };
  }

  const modelConfig = await getActiveModelConfig();
  if (!modelConfig) {
    return { skipped: true, reason: "No embedding model config in database" };
  }

  const { data: existingEmbed } = await supabase
    .from("embeddings")
    .select("id, content_hash")
    .eq("entity_type", options.entityType)
    .eq("entity_id", options.entityId)
    .eq("chunk_index", 0)
    .maybeSingle();

  if (
    !options.forceRebuild &&
    existingEmbed?.content_hash === contentHash
  ) {
    return { skipped: true, reason: "Content unchanged (idempotent skip)" };
  }

  const pendingId = await getEmbeddingStatusId("pending");
  const entityStatusId = await getActiveStatusId();

  const { data: job, error: jobErr } = await supabase
    .from("embedding_jobs")
    .insert({
      entity_type: options.entityType,
      entity_id: options.entityId,
      embedding_model_config_id: modelConfig.id,
      status_id: pendingId,
      content_hash: contentHash,
      token_estimate: estimateTokens(built.text),
      created_by: options.userId ?? null,
      status: entityStatusId,
      metadata: {
        ...built.metadata,
        ...options.metadata,
      },
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    return { skipped: true, reason: jobErr?.message ?? "Failed to enqueue job" };
  }

  await writeAudit("embedding_job_enqueue", "embedding_job", job.id, {
    entity_type: options.entityType,
    entity_id: options.entityId,
    content_hash: contentHash,
  });

  if (options.processImmediately !== false) {
    const processed = await processEmbeddingJob(job.id, options.userId ?? null);
    return { jobId: job.id, processed: processed.ok, reason: processed.error };
  }

  return { jobId: job.id };
}

export async function processEmbeddingJob(
  jobId: string,
  userId?: string | null
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const supabase = await createClient();
  const { data: job, error } = await supabase
    .from("embedding_jobs")
    .select("*, embedding_model_configs(*)")
    .eq("id", jobId)
    .single();

  if (error || !job) return { ok: false, error: "Job not found" };

  if (!isEmbeddableEntityType(job.entity_type)) {
    return { ok: false, error: "Invalid entity type on job" };
  }

  const inProgressId = await getEmbeddingStatusId("in_progress");
  const succeededId = await getEmbeddingStatusId("succeeded");
  const failedId = await getEmbeddingStatusId("failed");
  const skippedId = await getEmbeddingStatusId("skipped");
  const entityStatusId = await getActiveStatusId();

  await supabase
    .from("embedding_jobs")
    .update({ status_id: inProgressId, started_at: new Date().toISOString() })
    .eq("id", jobId);

  const built = await buildEmbeddableContent(job.entity_type, job.entity_id);
  if (!built?.text.trim()) {
    await finalizeJob(jobId, skippedId, "No content", null);
    return { ok: true, skipped: true };
  }

  const contentHash = hashEmbeddableContent(built.text);
  if (contentHash !== job.content_hash) {
    await supabase.from("embedding_jobs").update({ content_hash: contentHash }).eq("id", jobId);
  }

  const { data: existingEmbed } = await supabase
    .from("embeddings")
    .select("content_hash")
    .eq("entity_type", job.entity_type)
    .eq("entity_id", job.entity_id)
    .eq("chunk_index", 0)
    .maybeSingle();

  if (existingEmbed?.content_hash === contentHash && job.metadata?.force_rebuild !== true) {
    await finalizeJob(jobId, skippedId, "Content unchanged", null);
    return { ok: true, skipped: true };
  }

  const config = job.embedding_model_configs as {
    provider: string;
    model: string;
    dimensions: number;
    max_input_tokens: number;
  };

  if (!isEmbeddingProviderEnabled()) {
    const providerDisabledId = await getEmbeddingStatusId("provider_disabled");
    await finalizeJob(
      jobId,
      providerDisabledId,
      getEmbeddingProviderStatusMessage() || "Embedding provider disabled",
      null
    );
    return { ok: true, skipped: true };
  }

  const runtime = getEmbeddingRuntimeConfig();

  try {
    const result = await generateEmbeddingWithMeta(
      built.text,
      config.max_input_tokens
    );
    if (!result) {
      await finalizeJob(
        jobId,
        failedId,
        "Embedding provider returned no vector",
        null
      );
      return { ok: false, error: "Embedding provider returned no vector" };
    }
    const vector = result.vector;
    const tokenEstimate = result.tokenEstimate;

    await supabase.from("embeddings").upsert(
      {
        entity_type: job.entity_type,
        entity_id: job.entity_id,
        chunk_index: 0,
        content_text: built.text.slice(0, 50000),
        embedding: vector,
        embedding_model: runtime.model || config.model,
        content_hash: contentHash,
        embedding_model_config_id: job.embedding_model_config_id,
        provider: runtime.kind,
        dimensions: runtime.dimensions,
        token_estimate: tokenEstimate,
        metadata: built.metadata,
        created_by: userId,
        status: entityStatusId,
      },
      { onConflict: "entity_type,entity_id,chunk_index" }
    );

    await supabase
      .from("embedding_jobs")
      .update({
        status_id: succeededId,
        token_estimate: tokenEstimate,
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", jobId);

    await writeAudit("embedding_job_complete", "embedding_job", jobId, {
      entity_type: job.entity_type,
      entity_id: job.entity_id,
    });

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Embedding failed";
    await finalizeJob(jobId, failedId, msg, null);
    return { ok: false, error: msg };
  }
}

async function finalizeJob(
  jobId: string,
  statusId: string,
  message: string | null,
  tokenEstimate: number | null
) {
  const supabase = await createClient();
  await supabase
    .from("embedding_jobs")
    .update({
      status_id: statusId,
      error_message: message,
      token_estimate: tokenEstimate ?? undefined,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

export async function processPendingEmbeddingJobs(limit = 10) {
  const supabase = await createClient();
  const pendingId = await getEmbeddingStatusId("pending");
  const { data: jobs } = await supabase
    .from("embedding_jobs")
    .select("id")
    .eq("status_id", pendingId)
    .order("created_at", { ascending: true })
    .limit(limit);

  const results: { jobId: string; ok: boolean }[] = [];
  for (const job of jobs ?? []) {
    const r = await processEmbeddingJob(job.id);
    results.push({ jobId: job.id, ok: r.ok });
  }
  return results;
}

export async function rebuildEmbeddingsForEntity(
  entityType: string,
  entityId: string,
  userId?: string | null
) {
  return enqueueEmbeddingJob({
    entityType,
    entityId,
    userId,
    forceRebuild: true,
    metadata: { force_rebuild: true },
    processImmediately: true,
  });
}
