"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  enqueueEmbeddingJob,
  processEmbeddingJob,
  processPendingEmbeddingJobs,
  rebuildEmbeddingsForEntity,
} from "@/lib/embeddings/queue";
import { isEmbeddableEntityType } from "@/lib/embeddings/content";

export async function listEmbeddingJobs(limit = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("embedding_jobs")
    .select(
      `*,
      embedding_statuses(id, code, label),
      embedding_model_configs(id, provider, model, dimensions)`
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listEmbeddingModelConfigs() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("embedding_model_configs")
    .select("*")
    .order("provider");
  if (error) throw new Error(error.message);
  return data;
}

export async function generateEmbeddingsForEntity(
  entityType: string,
  entityId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  if (!isEmbeddableEntityType(entityType)) {
    return { error: "Unsupported entity type" };
  }

  const result = await enqueueEmbeddingJob({
    entityType,
    entityId,
    userId: user.id,
    processImmediately: true,
  });

  revalidatePath("/embeddings");
  revalidatePath("/search");

  if (result.skipped && !result.jobId) {
    return { ok: true, skipped: true, reason: result.reason };
  }
  return {
    ok: true,
    jobId: result.jobId,
    reason: result.reason,
    processed: result.processed,
  };
}

export async function rebuildEmbeddingsAction(entityType: string, entityId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  if (!isEmbeddableEntityType(entityType)) {
    return { error: "Unsupported entity type" };
  }

  const result = await rebuildEmbeddingsForEntity(entityType, entityId, user.id);
  revalidatePath("/embeddings");
  revalidatePath("/search");
  return result;
}

export async function processEmbeddingQueue(limit = 20) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const results = await processPendingEmbeddingJobs(limit);
  revalidatePath("/embeddings");
  return { ok: true, processed: results.length, results };
}

export async function processSingleEmbeddingJob(jobId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const result = await processEmbeddingJob(jobId, user.id);
  revalidatePath("/embeddings");
  revalidatePath("/search");
  if (!result.ok) return { error: result.error ?? "Processing failed" };
  return { ok: true, skipped: result.skipped };
}
