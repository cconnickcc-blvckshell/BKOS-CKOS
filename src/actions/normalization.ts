"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { writeAudit } from "@/lib/audit";
import { resolveEntityAlias } from "@/lib/entities/resolver";
import { getNormalizationStatusId } from "@/lib/normalization/normalization-status";
import { buildCitations } from "@/lib/normalization/citations";
import { enqueueEmbeddingJob } from "@/lib/embeddings/queue";
import { z } from "zod";

export async function listNormalizationStatuses() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("normalization_statuses")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data;
}

export async function listNormalizationTemplates() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("normalization_templates")
    .select("*, knowledge_types(id, code, label)")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data;
}

export async function listNormalizationJobs(limit = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("normalization_jobs")
    .select(
      `*,
      normalization_statuses(id, code, label),
      normalization_templates(id, code, label),
      knowledge_domains(id, code, label),
      source_extraction_results(id, title, source_version_id)`
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getExtractionContext(extractionId: string) {
  const supabase = await createClient();
  const { data: extraction, error } = await supabase
    .from("source_extraction_results")
    .select(
      `*,
      source_versions(
        id, version_number, source_id, captured_at,
        sources(id, title, url, domain_id)
      )`
    )
    .eq("id", extractionId)
    .single();

  if (error || !extraction) throw new Error("Extraction not found");

  const version = extraction.source_versions as {
    id: string;
    version_number: number;
    source_id: string;
    captured_at: string;
    sources: { id: string; title: string; url: string | null; domain_id: string | null };
  };

  return {
    extraction,
    sourceVersionId: version.id,
    sourceId: version.source_id,
    source: version.sources,
    versionNumber: version.version_number,
    capturedAt: version.captured_at,
  };
}

export async function getNormalizationJob(jobId: string) {
  const supabase = await createClient();
  const { data: job, error } = await supabase
    .from("normalization_jobs")
    .select(
      `*,
      normalization_statuses(id, code, label),
      normalization_templates(id, code, label, default_structured_data, knowledge_types(id, code, label)),
      knowledge_domains(id, code, label),
      source_extraction_results(
        id, title, canonical_url, summary, extracted_markdown, extracted_text,
        source_versions(id, version_number, source_id, sources(id, title, url))
      )`
    )
    .eq("id", jobId)
    .single();

  if (error || !job) throw new Error("Normalization job not found");

  const { data: outputs } = await supabase
    .from("normalization_job_outputs")
    .select(
      `*,
      normalization_statuses(id, code, label),
      knowledge_types(id, code, label),
      entities(id, canonical_slug, display_name),
      normalization_review_decisions(id, decision, notes, created_knowledge_record_id, created_at)`
    )
    .eq("normalization_job_id", jobId)
    .order("created_at");

  return { job, outputs: outputs ?? [] };
}

const createJobSchema = z.object({
  source_extraction_result_id: z.string().uuid(),
  template_code: z.string().min(1),
  domain_code: z.string().min(1),
});

export async function createNormalizationJob(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = createJobSchema.safeParse({
    source_extraction_result_id: formData.get("source_extraction_result_id"),
    template_code: formData.get("template_code"),
    domain_code: formData.get("domain_code"),
  });

  if (!parsed.success) return { error: parsed.error.message };

  try {
    const ctx = await getExtractionContext(parsed.data.source_extraction_result_id);

    const [{ data: template }, { data: domain }] = await Promise.all([
      supabase
        .from("normalization_templates")
        .select("*, knowledge_types(id, code, label)")
        .eq("code", parsed.data.template_code)
        .single(),
      supabase
        .from("knowledge_domains")
        .select("id")
        .eq("code", parsed.data.domain_code)
        .single(),
    ]);

    if (!template || !domain) return { error: "Invalid template or domain" };

    const inProgressId = await getNormalizationStatusId("in_progress");
    const draftReadyId = await getNormalizationStatusId("draft_ready");
    const pendingReviewId = await getNormalizationStatusId("pending_review");
    const entityStatusId = await getActiveStatusId();

    const { data: job, error: jobErr } = await supabase
      .from("normalization_jobs")
      .insert({
        source_extraction_result_id: parsed.data.source_extraction_result_id,
        source_version_id: ctx.sourceVersionId,
        domain_id: domain.id,
        status_id: inProgressId,
        template_id: template.id,
        requested_by: user.id,
        started_at: new Date().toISOString(),
        created_by: user.id,
        status: entityStatusId,
        metadata: { template_code: template.code },
      })
      .select("id")
      .single();

    if (jobErr || !job) return { error: jobErr?.message ?? "Failed to create job" };

    await writeAudit("normalization_job_create", "normalization_job", job.id, {
      extraction_id: parsed.data.source_extraction_result_id,
      template_code: template.code,
    });

    const ext = ctx.extraction as {
      title: string | null;
      summary: string | null;
      canonical_url: string | null;
    };

    const citations = buildCitations({
      source_id: ctx.sourceId,
      source_version_id: ctx.sourceVersionId,
      source_extraction_result_id: parsed.data.source_extraction_result_id,
      source_title: ctx.source.title,
      canonical_url: ext.canonical_url,
      version_number: ctx.versionNumber,
      captured_at: ctx.capturedAt,
    });

    const kt = template.knowledge_types as { id: string };
    const { data: output, error: outErr } = await supabase
      .from("normalization_job_outputs")
      .insert({
        normalization_job_id: job.id,
        proposed_record_type_id: kt.id,
        proposed_title: ext.title ?? ctx.source.title ?? "Untitled draft",
        proposed_summary: ext.summary ?? null,
        proposed_structured_data: template.default_structured_data ?? {},
        confidence_score: 0.5,
        citations,
        status_id: pendingReviewId,
        created_by: user.id,
        status: entityStatusId,
      })
      .select("id")
      .single();

    if (outErr || !output) {
      await supabase
        .from("normalization_jobs")
        .update({
          status_id: await getNormalizationStatusId("failed"),
          error_message: outErr?.message ?? "Output create failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return { error: outErr?.message ?? "Failed to create draft output" };
    }

    await supabase
      .from("normalization_jobs")
      .update({
        status_id: draftReadyId,
        completed_at: new Date().toISOString(),
        metadata: {
          template_code: template.code,
          output_id: output.id,
        },
      })
      .eq("id", job.id);

    revalidatePath("/normalization");
    revalidatePath(`/sources/${ctx.sourceId}`);

    return { ok: true, jobId: job.id, outputId: output.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Create job failed" };
  }
}

const outputSchema = z.object({
  proposed_title: z.string().min(1),
  proposed_summary: z.string().optional(),
  proposed_structured_data: z.string().optional(),
  proposed_entity_alias: z.string().optional(),
  confidence_score: z.coerce.number().min(0).max(1).optional(),
  review_notes: z.string().optional(),
  extraction_notes: z.string().optional(),
  domain_code: z.string().min(1),
});

export async function updateNormalizationOutput(outputId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = outputSchema.safeParse({
    proposed_title: formData.get("proposed_title"),
    proposed_summary: formData.get("proposed_summary") || undefined,
    proposed_structured_data: formData.get("proposed_structured_data") || undefined,
    proposed_entity_alias: formData.get("proposed_entity_alias") || undefined,
    confidence_score: formData.get("confidence_score") || undefined,
    review_notes: formData.get("review_notes") || undefined,
    extraction_notes: formData.get("extraction_notes") || undefined,
    domain_code: formData.get("domain_code"),
  });

  if (!parsed.success) return { error: parsed.error.message };

  let structuredData: Record<string, unknown> = {};
  if (parsed.data.proposed_structured_data?.trim()) {
    try {
      structuredData = JSON.parse(parsed.data.proposed_structured_data);
    } catch {
      return { error: "Invalid JSON in structured data" };
    }
  }

  const { data: existing } = await supabase
    .from("normalization_job_outputs")
    .select("id, status_id")
    .eq("id", outputId)
    .single();

  if (existing?.status_id) {
    const { data: st } = await supabase
      .from("normalization_statuses")
      .select("code")
      .eq("id", existing.status_id)
      .single();
    if (st?.code === "approved" || st?.code === "rejected") {
      return { error: "Cannot edit a finalized output" };
    }
  }

  let resolvedEntityId: string | null = null;
  const alias = parsed.data.proposed_entity_alias?.trim();
  if (alias) {
    const resolved = await resolveEntityAlias(parsed.data.domain_code, alias);
    resolvedEntityId = resolved?.entity_id ?? null;
  }

  const { error } = await supabase
    .from("normalization_job_outputs")
    .update({
      proposed_title: parsed.data.proposed_title,
      proposed_summary: parsed.data.proposed_summary ?? null,
      proposed_structured_data: structuredData,
      proposed_entity_alias: alias || null,
      resolved_entity_id: resolvedEntityId,
      confidence_score: parsed.data.confidence_score ?? null,
      review_notes: parsed.data.review_notes ?? null,
      extraction_notes: parsed.data.extraction_notes ?? null,
    })
    .eq("id", outputId);

  if (error) return { error: error.message };

  const { data: output } = await supabase
    .from("normalization_job_outputs")
    .select("normalization_job_id")
    .eq("id", outputId)
    .single();

  revalidatePath(`/normalization/${output?.normalization_job_id}`);
  return { ok: true, resolved_entity_id: resolvedEntityId };
}

export async function approveNormalizationOutput(outputId: string, notes?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: output, error: outErr } = await supabase
    .from("normalization_job_outputs")
    .select("*")
    .eq("id", outputId)
    .single();

  if (outErr || !output) return { error: "Output not found" };

  const { data: priorDecision } = await supabase
    .from("normalization_review_decisions")
    .select("id, decision")
    .eq("normalization_job_output_id", outputId)
    .eq("decision", "approved")
    .maybeSingle();

  if (priorDecision) return { error: "Output already approved" };

  const { data: job } = await supabase
    .from("normalization_jobs")
    .select("id, domain_id, source_version_id")
    .eq("id", output.normalization_job_id)
    .single();

  if (!job) return { error: "Job not found" };

  const { data: version } = await supabase
    .from("source_versions")
    .select("source_id")
    .eq("id", job.source_version_id)
    .single();

  if (!version) return { error: "Source version not found" };

  const sourceId = version.source_id;
  const activeStatusId = await getActiveStatusId();
  const approvedStatusId = await getNormalizationStatusId("approved");
  const entityStatusId = await getActiveStatusId();

  const structuredWithProvenance = {
    ...(output.proposed_structured_data as Record<string, unknown>),
    _normalization: {
      job_output_id: outputId,
      template_type: output.proposed_record_type_id,
      citations: output.citations,
    },
  };

  const { data: record, error: recErr } = await supabase
    .from("knowledge_records")
    .insert({
      title: output.proposed_title,
      summary: output.proposed_summary,
      knowledge_type_id: output.proposed_record_type_id,
      source_id: sourceId,
      source_version_id: job.source_version_id,
      domain_id: job.domain_id,
      entity_id: output.resolved_entity_id,
      structured_data: structuredWithProvenance,
      confidence: output.confidence_score,
      created_by: user.id,
      status: activeStatusId,
    })
    .select("id, title, summary")
    .single();

  if (recErr || !record) return { error: recErr?.message ?? "Failed to create knowledge record" };

  await enqueueEmbeddingJob({
    entityType: "knowledge_record",
    entityId: record.id,
    userId: user.id,
    metadata: { via: "normalization_approve", output_id: outputId },
  });

  await supabase.from("normalization_review_decisions").insert({
    normalization_job_output_id: outputId,
    decision: "approved",
    reviewer_id: user.id,
    notes: notes ?? null,
    created_knowledge_record_id: record.id,
    created_by: user.id,
    status: entityStatusId,
  });

  await supabase
    .from("normalization_job_outputs")
    .update({ status_id: approvedStatusId })
    .eq("id", outputId);

  await writeAudit("normalization_approve", "normalization_job_output", outputId, {
    knowledge_record_id: record.id,
    job_id: job.id,
  });

  await supabase
    .from("normalization_jobs")
    .update({
      status_id: await getNormalizationStatusId("completed"),
    })
    .eq("id", job.id);
  await writeAudit("create", "knowledge_record", record.id, {
    via: "normalization",
    source_version_id: job.source_version_id,
  });

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${record.id}`);
  revalidatePath(`/normalization/${job.id}`);
  revalidatePath("/normalization");

  return { ok: true, knowledgeRecordId: record.id };
}

export async function rejectNormalizationOutput(outputId: string, notes?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const rejectedStatusId = await getNormalizationStatusId("rejected");
  const entityStatusId = await getActiveStatusId();

  const { data: output } = await supabase
    .from("normalization_job_outputs")
    .select("normalization_job_id")
    .eq("id", outputId)
    .single();

  await supabase.from("normalization_review_decisions").insert({
    normalization_job_output_id: outputId,
    decision: "rejected",
    reviewer_id: user.id,
    notes: notes ?? null,
    created_by: user.id,
    status: entityStatusId,
  });

  await supabase
    .from("normalization_job_outputs")
    .update({ status_id: rejectedStatusId })
    .eq("id", outputId);

  await writeAudit("normalization_reject", "normalization_job_output", outputId, {
    notes: notes ?? null,
  });

  revalidatePath(`/normalization/${output?.normalization_job_id}`);
  revalidatePath("/normalization");

  return { ok: true };
}
