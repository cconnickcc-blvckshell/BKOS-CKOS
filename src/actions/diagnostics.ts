"use server";

import { createClient } from "@/lib/supabase/server";
import { getNormalizationJob } from "@/actions/normalization";
import { getAiDraftAvailability } from "@/actions/normalization-ai";
import { getAiRuntimeConfig } from "@/lib/providers/ai";
import { getEmbeddingRuntimeConfig } from "@/lib/providers/embedding";
import {
  formatDiagnosticSummary,
  type DiagnosticBundle,
} from "@/lib/observability/diagnostics";
import { getErrorCodeRow } from "@/lib/observability/lookup";
import { listJobAttempts } from "@/actions/events";
import type { ErrorCodeKey } from "@/lib/observability/error-codes";

export async function getFetchJobDiagnostics(
  jobId: string
): Promise<DiagnosticBundle> {
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("source_fetch_jobs")
    .select(
      `*,
      acquisition_statuses(code, label),
      sources(id, title, url)`
    )
    .eq("id", jobId)
    .single();

  if (!job) {
    return {
      title: "Source fetch",
      status: "failed",
      errorCode: "UNKNOWN_ERROR",
      userMessage: "Fetch job not found",
      sections: [],
    };
  }

  const meta = (job.metadata ?? {}) as Record<string, unknown>;
  const statusCode = (job.acquisition_statuses as { code: string })?.code;
  const isFailed = Boolean(job.error_message);
  const errorCode = meta.error_code as ErrorCodeKey | undefined;

  let fixes: string[] = [];
  let causes: string[] = [];
  if (errorCode) {
    const row = await getErrorCodeRow(errorCode);
    fixes = row?.recommended_fixes ?? [];
    causes = row?.likely_causes ?? [];
  }

  const attempts = await listJobAttempts("source_fetch_job", jobId);

  return {
    title: "Source acquisition",
    subtitle: (job.sources as { title: string })?.title ?? job.normalized_url,
    status: isFailed
      ? meta.retryable
        ? "retryable"
        : "failed"
      : statusCode === "succeeded"
        ? "success"
        : "warning",
    errorCode,
    userMessage: job.error_message ?? undefined,
    likelyCauses: causes,
    recommendedFixes: fixes,
    sections: [
      {
        title: "URL & trust",
        items: [
          { label: "Requested URL", value: job.requested_url },
          { label: "Normalized URL", value: job.normalized_url },
          { label: "Domain", value: job.domain },
          {
            label: "Trusted domain",
            value: String(meta.trusted_domain ?? "—"),
          },
          {
            label: "Robots respected",
            value: String(meta.robots_respected ?? "—"),
          },
        ],
      },
      {
        title: "HTTP & extraction",
        items: [
          {
            label: "HTTP status",
            value: job.http_status != null ? String(job.http_status) : "—",
          },
          { label: "Content type", value: job.content_type ?? "—" },
          {
            label: "Fetch duration",
            value: meta.fetch_duration_ms
              ? `${meta.fetch_duration_ms} ms`
              : "—",
          },
          {
            label: "Extraction size",
            value: meta.extraction_size != null ? String(meta.extraction_size) : "—",
          },
          {
            label: "Status",
            value: (job.acquisition_statuses as { label: string })?.label ?? "—",
            tone: isFailed ? "failed" : "success",
          },
        ],
      },
      {
        title: "Attempts",
        items: attempts.length
          ? attempts.map((a) => ({
              label: `Attempt ${a.attempt_number}`,
              value: `${a.status} · ${a.duration_ms ?? 0}ms${a.error_message ? ` · ${a.error_message}` : ""}`,
              tone: a.status as DiagnosticBundle["status"],
            }))
          : [{ label: "Attempts", value: "No recorded attempts" }],
      },
    ],
    rawMetadata: meta,
  };
}

export async function getNormalizationDiagnostics(
  jobId: string
): Promise<DiagnosticBundle> {
  const data = await getNormalizationJob(jobId);
  const ai = await getAiDraftAvailability();
  const aiCfg = getAiRuntimeConfig();
  const { job, outputs } = data;
  const template = job.normalization_templates as { code: string; label: string };
  const extraction = job.source_extraction_results;
  const aiOutputs = outputs.filter((o) => o.is_ai_proposal);
  return {
    title: "Normalization",
    subtitle: template.label,
    status: "success",
    sections: [
      {
        title: "Source",
        items: [
          {
            label: "Source version",
            value: job.source_version_id ? "Linked" : "Missing",
            tone: job.source_version_id ? "success" : "failed",
          },
          {
            label: "Extraction present",
            value: extraction ? "Yes" : "No",
            tone: extraction ? "success" : "failed",
          },
          {
            label: "Template",
            value: `${template.code} (${template.label})`,
          },
        ],
      },
      {
        title: "AI drafts",
        items: [
          {
            label: "AI provider",
            value: ai.enabled
              ? `${aiCfg.kind} / ${aiCfg.model}`
              : "Disabled",
            tone: ai.enabled ? "success" : "skipped",
          },
          { label: "AI draft count", value: String(aiOutputs.length) },
          { label: "Manual/other outputs", value: String(outputs.length - aiOutputs.length) },
          {
            label: "Job status",
            value: (job.normalization_statuses as { label: string })?.label ?? "—",
          },
        ],
      },
    ],
    recommendedFixes: ai.message ? [ai.message] : undefined,
  };
}

export async function getEmbeddingJobDiagnostics(
  jobId: string
): Promise<DiagnosticBundle> {
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("embedding_jobs")
    .select(`*, embedding_model_configs(provider, model, dimensions), embedding_statuses(code, label)`)
    .eq("id", jobId)
    .single();

  if (!job) {
    return {
      title: "Embedding job",
      status: "failed",
      userMessage: "Job not found",
      sections: [],
    };
  }

  const embCfg = getEmbeddingRuntimeConfig();
  const statusCode = (job.embedding_statuses as { code: string })?.code;
  const tone =
    statusCode === "succeeded"
      ? "success"
      : statusCode === "skipped" || statusCode === "provider_disabled"
        ? "skipped"
        : statusCode === "failed"
          ? "failed"
          : "warning";

  return {
    title: "Embedding job",
    subtitle: `${job.entity_type} / ${job.entity_id}`,
    status: tone,
    userMessage: job.error_message ?? undefined,
    sections: [
      {
        title: "Provider",
        items: [
          {
            label: "Env provider",
            value: embCfg.enabled ? `${embCfg.kind}` : "disabled",
            tone: embCfg.enabled ? "success" : "skipped",
          },
          {
            label: "Model",
            value:
              (job.embedding_model_configs as { model: string })?.model ??
              embCfg.model,
          },
          {
            label: "Dimensions (env)",
            value: String(embCfg.dimensions),
          },
          { label: "Content hash", value: job.content_hash ?? "—" },
          {
            label: "Status",
            value: (job.embedding_statuses as { label: string })?.label ?? "—",
            tone,
          },
        ],
      },
    ],
  };
}

export async function getDecisionDiagnostics(
  requestId: string
): Promise<DiagnosticBundle> {
  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("decision_recommendations")
    .select(
      `*,
      decision_recommendation_items(id, rank, entity_type, title, summary, confidence_score),
      decision_requests(id, goal_summary, metadata)`
    )
    .eq("decision_request_id", requestId)
    .maybeSingle();

  const items =
    (rec?.decision_recommendation_items as {
      id: string;
      entity_type: string;
      title: string;
    }[]) ?? [];

  const meta = (rec?.metadata ?? {}) as Record<string, unknown>;
  const insufficient = meta.insufficient_evidence as string | undefined;

  return {
    title: "Decision engine",
    subtitle: (rec?.decision_requests as { goal_summary: string })?.goal_summary,
    status: items.length > 0 ? "success" : "warning",
    userMessage: insufficient,
    sections: [
      {
        title: "Retrieval",
        items: [
          { label: "Recommendation items", value: String(items.length) },
          {
            label: "Retrieved knowledge",
            value: String(
              items.filter((i) => i.entity_type === "knowledge_record").length
            ),
          },
          {
            label: "Retrieved workflows",
            value: String(
              items.filter((i) =>
                ["workflow", "workflow_analysis"].includes(i.entity_type)
              ).length
            ),
          },
          {
            label: "Insufficient evidence",
            value: insufficient ?? "None noted",
            tone: insufficient ? "warning" : "success",
          },
        ],
      },
    ],
    rawMetadata: meta,
  };
}

export async function copyDiagnosticSummary(bundle: DiagnosticBundle) {
  return formatDiagnosticSummary(bundle);
}
