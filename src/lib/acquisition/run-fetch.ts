import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getActiveStatusId } from "@/lib/status";
import { getAcquisitionStatusId } from "@/lib/acquisition/acquisition-status";
import { fetchTrustedPage, type CrawlPolicy } from "@/lib/acquisition/fetcher";
import {
  extractFromHtml,
  extractFromPlainText,
} from "@/lib/acquisition/extractor";
import { hostnameFromUrl, normalizeSourceUrl } from "@/lib/acquisition/normalize-url";
import {
  assertTrustedUrl,
  matchTrustedDomain,
  type TrustedDomainRow,
} from "@/lib/acquisition/trusted-domains";
import {
  AppError,
  ErrorCodes,
  logSystemEvent,
  mapFetchErrorToCode,
  recordJobAttempt,
} from "@/lib/observability";

export type RunFetchResult =
  | {
      ok: true;
      jobId: string;
      sourceVersionId: string;
      extractionId: string;
    }
  | {
      ok: false;
      error: string;
      code: string;
      retryable: boolean;
      recommendedNextStep: string;
      jobId?: string;
    };

async function failFetch(
  jobId: string,
  userId: string,
  startedAt: Date,
  appErr: AppError,
  meta: Record<string, unknown>
): Promise<RunFetchResult> {
  const supabase = await createClient();
  const failedId = await getAcquisitionStatusId("failed");
  const attemptStatus = appErr.retryable ? "retryable" : "failed";

  await supabase
    .from("source_fetch_jobs")
    .update({
      status_id: failedId,
      error_message: appErr.userMessage,
      completed_at: new Date().toISOString(),
      metadata: { ...meta, error_code: appErr.code, retryable: appErr.retryable },
    })
    .eq("id", jobId);

  await recordJobAttempt({
    jobType: "source_fetch_job",
    jobId,
    status: attemptStatus,
    startedAt,
    error: appErr,
    metadata: meta,
    userId,
  });

  await logSystemEvent({
    eventTypeCode: appErr.retryable ? "pipeline_retryable" : "pipeline_failed",
    severity: appErr.retryable ? "warning" : "failed",
    message: appErr.userMessage,
    entityType: "source_fetch_job",
    entityId: jobId,
    error: appErr,
    metadata: meta,
    userId,
  });

  await writeAudit("source_fetch_failed", "source_fetch_job", jobId, {
    error_code: appErr.code,
    ...meta,
  });

  return {
    ok: false,
    error: appErr.userMessage,
    code: appErr.code,
    retryable: appErr.retryable,
    recommendedNextStep: appErr.recommendedNextStep,
    jobId,
  };
}

export async function runSourceFetch(
  sourceId: string,
  userId: string,
  urlInput: string
): Promise<RunFetchResult> {
  const startedAt = new Date();
  const supabase = await createClient();

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeSourceUrl(urlInput);
  } catch (e) {
    const appErr = new AppError({
      code: ErrorCodes.URL_NOT_TRUSTED,
      userMessage: "The URL is not valid. Use a full https:// link.",
      technicalDetail: e instanceof Error ? e.message : "Invalid URL",
      retryable: false,
      recommendedNextStep: "Correct the URL and try again.",
    });
    return {
      ok: false,
      error: appErr.userMessage,
      code: appErr.code,
      retryable: false,
      recommendedNextStep: appErr.recommendedNextStep,
    };
  }

  const hostname = hostnameFromUrl(normalizedUrl);

  const { data: trustedRows, error: trustedErr } = await supabase
    .from("trusted_source_domains")
    .select("id, domain, label, is_active, allow_subdomains")
    .eq("is_active", true);

  if (trustedErr) {
    const appErr = new AppError({
      code: ErrorCodes.SUPABASE_RPC_FAILED,
      userMessage: "Could not load trusted domains.",
      technicalDetail: trustedErr.message,
      retryable: true,
      recommendedNextStep: "Check Supabase connectivity and retry.",
    });
    return {
      ok: false,
      error: appErr.userMessage,
      code: appErr.code,
      retryable: true,
      recommendedNextStep: appErr.recommendedNextStep,
    };
  }

  let trusted: TrustedDomainRow;
  try {
    trusted = assertTrustedUrl(normalizedUrl, trustedRows ?? []);
  } catch {
    const appErr = new AppError({
      code: ErrorCodes.URL_NOT_TRUSTED,
      userMessage: `Domain "${hostname}" is not on the trusted source list.`,
      technicalDetail: `URL: ${normalizedUrl}`,
      retryable: false,
      recommendedNextStep:
        "Use a URL from comfyui-wiki.com, docs.comfy.org, github.com, huggingface.co, or arxiv.org.",
      metadata: { hostname, normalized_url: normalizedUrl },
    });
    await logSystemEvent({
      eventTypeCode: "pipeline_failed",
      severity: "failed",
      message: appErr.userMessage,
      entityType: "source",
      entityId: sourceId,
      error: appErr,
      userId,
    });
    return {
      ok: false,
      error: appErr.userMessage,
      code: appErr.code,
      retryable: false,
      recommendedNextStep: appErr.recommendedNextStep,
    };
  }

  const { data: policyRow } = await supabase
    .from("source_crawl_policies")
    .select("*")
    .eq("trusted_domain_id", trusted.id)
    .maybeSingle();

  const policy: CrawlPolicy = {
    max_response_bytes: policyRow?.max_response_bytes ?? 5_242_880,
    fetch_timeout_ms: policyRow?.fetch_timeout_ms ?? 30_000,
    respect_robots_txt: policyRow?.respect_robots_txt ?? true,
    user_agent:
      policyRow?.user_agent ??
      "CKOS-SourceAcquisition/1.0 (+https://github.com/cconnickcc-blvckshell/BKOS-CKOS)",
    allowed_content_types: policyRow?.allowed_content_types ?? [
      "text/html",
      "text/plain",
      "text/markdown",
      "application/json",
    ],
  };

  const pendingId = await getAcquisitionStatusId("pending");
  const inProgressId = await getAcquisitionStatusId("in_progress");
  const succeededId = await getAcquisitionStatusId("succeeded");
  const failedId = await getAcquisitionStatusId("failed");
  const pendingReviewId = await getAcquisitionStatusId("pending_review");
  const entityStatusId = await getActiveStatusId();

  const { data: job, error: jobErr } = await supabase
    .from("source_fetch_jobs")
    .insert({
      source_id: sourceId,
      requested_url: urlInput.trim(),
      normalized_url: normalizedUrl,
      domain: hostname,
      status_id: pendingId,
      created_by: userId,
      status: entityStatusId,
      metadata: {
        trusted_domain: trusted.domain,
        robots_respected: policy.respect_robots_txt,
      },
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    const appErr = new AppError({
      code: ErrorCodes.SUPABASE_RPC_FAILED,
      userMessage: "Could not create fetch job.",
      technicalDetail: jobErr?.message,
      retryable: true,
      recommendedNextStep: "Retry fetch or check database migrations.",
    });
    return {
      ok: false,
      error: appErr.userMessage,
      code: appErr.code,
      retryable: true,
      recommendedNextStep: appErr.recommendedNextStep,
    };
  }

  await logSystemEvent({
    eventTypeCode: "pipeline_started",
    severity: "info",
    message: `Fetch started for ${normalizedUrl}`,
    entityType: "source_fetch_job",
    entityId: job.id,
    metadata: {
      normalized_url: normalizedUrl,
      trusted_domain: trusted.domain,
    },
    userId,
  });

  await writeAudit("source_fetch_start", "source_fetch_job", job.id, {
    source_id: sourceId,
    normalized_url: normalizedUrl,
  });

  await supabase
    .from("source_fetch_jobs")
    .update({
      status_id: inProgressId,
      started_at: startedAt.toISOString(),
    })
    .eq("id", job.id);

  const fetchStarted = Date.now();
  const outcome = await fetchTrustedPage(normalizedUrl, policy);
  const fetchDurationMs = Date.now() - fetchStarted;

  if (!outcome.ok) {
    const code = mapFetchErrorToCode(outcome.error, outcome.httpStatus);
    const row = await import("@/lib/observability/lookup").then((m) =>
      m.getErrorCodeRow(code)
    );
    const appErr = new AppError({
      code,
      userMessage: row?.description ?? outcome.error,
      technicalDetail: outcome.error,
      retryable: row?.retryable ?? true,
      recommendedNextStep:
        row?.recommended_fixes?.[0] ?? "Review fetch diagnostics and retry if appropriate.",
      metadata: {
        http_status: outcome.httpStatus,
        content_type: outcome.contentType,
        fetch_duration_ms: fetchDurationMs,
        trusted_domain: trusted.domain,
        robots_respected: policy.respect_robots_txt,
      },
    });

    await supabase
      .from("source_fetch_jobs")
      .update({
        status_id: failedId,
        http_status: outcome.httpStatus,
        content_type: outcome.contentType,
        error_message: appErr.userMessage,
        completed_at: new Date().toISOString(),
        metadata: appErr.metadata,
      })
      .eq("id", job.id);

    return failFetch(job.id, userId, startedAt, appErr, {
      ...appErr.metadata,
      normalized_url: normalizedUrl,
    });
  }

  const finalHost = hostnameFromUrl(outcome.finalUrl);
  if (!matchTrustedDomain(finalHost, trustedRows ?? [])) {
    const appErr = new AppError({
      code: ErrorCodes.URL_NOT_TRUSTED,
      userMessage: `Redirect landed on untrusted domain: ${finalHost}`,
      technicalDetail: outcome.finalUrl,
      retryable: false,
      recommendedNextStep: "Use a URL that does not redirect off trusted domains.",
      metadata: {
        final_url: outcome.finalUrl,
        fetch_duration_ms: fetchDurationMs,
      },
    });
    return failFetch(job.id, userId, startedAt, appErr, appErr.metadata);
  }

  const { data: latest } = await supabase
    .from("source_versions")
    .select("version_number")
    .eq("source_id", sourceId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const versionNumber = (latest?.version_number ?? 0) + 1;
  const contentHash = createHash("sha256").update(outcome.body).digest("hex");

  const { data: version, error: versionErr } = await supabase
    .from("source_versions")
    .insert({
      source_id: sourceId,
      version_number: versionNumber,
      content: outcome.body,
      raw_snapshot: outcome.body,
      snapshot_content_type: outcome.contentType,
      content_hash: contentHash,
      change_summary: `Fetched from ${outcome.finalUrl}`,
      source_fetch_job_id: job.id,
      created_by: userId,
      status: entityStatusId,
      metadata: {
        fetch_url: outcome.finalUrl,
        content_type: outcome.contentType,
      },
    })
    .select("id")
    .single();

  if (versionErr || !version) {
    const appErr = new AppError({
      code: ErrorCodes.SUPABASE_RPC_FAILED,
      userMessage: "Fetch succeeded but saving the source version failed.",
      technicalDetail: versionErr?.message,
      retryable: true,
      recommendedNextStep: "Retry fetch; check database logs if this persists.",
    });
    return failFetch(job.id, userId, startedAt, appErr, { fetch_duration_ms: fetchDurationMs });
  }

  const extracted =
    outcome.contentType.includes("html")
      ? extractFromHtml(outcome.body, outcome.finalUrl)
      : extractFromPlainText(outcome.body, outcome.finalUrl);

  const textLen =
    (extracted.extracted_markdown?.length ?? 0) +
    (extracted.extracted_text?.length ?? 0);

  if (textLen < 20) {
    const appErr = new AppError({
      code: ErrorCodes.EXTRACTION_EMPTY_CONTENT,
      userMessage: "Page fetched but extraction produced almost no text.",
      technicalDetail: `Extracted length: ${textLen}`,
      retryable: false,
      recommendedNextStep:
        "Try a documentation page with static HTML content, not a shell-only or blocked page.",
      metadata: {
        fetch_duration_ms: fetchDurationMs,
        http_status: outcome.httpStatus,
        content_type: outcome.contentType,
        extraction_size: textLen,
      },
    });
    return failFetch(job.id, userId, startedAt, appErr, appErr.metadata);
  }

  const { data: extraction, error: extractErr } = await supabase
    .from("source_extraction_results")
    .insert({
      source_version_id: version.id,
      title: extracted.title,
      canonical_url: extracted.canonical_url,
      summary: extracted.summary,
      headings: extracted.headings,
      links: extracted.links,
      code_blocks: extracted.code_blocks,
      images: extracted.images,
      extracted_markdown: extracted.extracted_markdown,
      extracted_text: extracted.extracted_text,
      extraction_metadata: extracted.extraction_metadata,
      review_status_id: pendingReviewId,
      created_by: userId,
      status: entityStatusId,
    })
    .select("id")
    .single();

  if (extractErr || !extraction) {
    const appErr = new AppError({
      code: ErrorCodes.SUPABASE_RPC_FAILED,
      userMessage: "Extraction could not be saved.",
      technicalDetail: extractErr?.message,
      retryable: true,
      recommendedNextStep: "Retry fetch.",
    });
    return failFetch(job.id, userId, startedAt, appErr, {
      extraction_size: textLen,
      fetch_duration_ms: fetchDurationMs,
    });
  }

  await supabase
    .from("source_fetch_jobs")
    .update({
      status_id: succeededId,
      http_status: outcome.httpStatus,
      content_type: outcome.contentType,
      completed_at: new Date().toISOString(),
      error_message: null,
      metadata: {
        final_url: outcome.finalUrl,
        bytes: outcome.body.length,
        source_version_id: version.id,
        extraction_id: extraction.id,
        fetch_duration_ms: fetchDurationMs,
        extraction_size: textLen,
        trusted_domain: trusted.domain,
      },
    })
    .eq("id", job.id);

  await recordJobAttempt({
    jobType: "source_fetch_job",
    jobId: job.id,
    status: "success",
    startedAt,
    metadata: {
      fetch_duration_ms: fetchDurationMs,
      extraction_size: textLen,
      http_status: outcome.httpStatus,
    },
    userId,
  });

  await logSystemEvent({
    eventTypeCode: "pipeline_succeeded",
    severity: "success",
    message: `Fetch and extraction succeeded (${textLen} chars)`,
    entityType: "source_fetch_job",
    entityId: job.id,
    metadata: {
      fetch_duration_ms: fetchDurationMs,
      extraction_size: textLen,
      http_status: outcome.httpStatus,
      content_type: outcome.contentType,
    },
    userId,
  });

  const sourceUpdate: Record<string, string> = {
    url: outcome.finalUrl,
    last_synced_at: new Date().toISOString(),
  };
  if (extracted.title) sourceUpdate.title = extracted.title;
  await supabase.from("sources").update(sourceUpdate).eq("id", sourceId);

  await writeAudit("source_fetch_complete", "source_fetch_job", job.id, {
    source_id: sourceId,
    source_version_id: version.id,
    extraction_id: extraction.id,
  });

  const { enqueueEmbeddingJob } = await import("@/lib/embeddings/queue");
  await enqueueEmbeddingJob({
    entityType: "source_extraction_result",
    entityId: extraction.id,
    userId,
    metadata: { review_status: "pending_review" },
  });

  return {
    ok: true,
    jobId: job.id,
    sourceVersionId: version.id,
    extractionId: extraction.id,
  };
}
