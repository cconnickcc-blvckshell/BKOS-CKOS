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

export type RunFetchResult =
  | {
      ok: true;
      jobId: string;
      sourceVersionId: string;
      extractionId: string;
    }
  | { ok: false; error: string; jobId?: string };

export async function runSourceFetch(
  sourceId: string,
  userId: string,
  urlInput: string
): Promise<RunFetchResult> {
  const supabase = await createClient();

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeSourceUrl(urlInput);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid URL" };
  }

  const hostname = hostnameFromUrl(normalizedUrl);

  const { data: trustedRows, error: trustedErr } = await supabase
    .from("trusted_source_domains")
    .select("id, domain, label, is_active, allow_subdomains")
    .eq("is_active", true);

  if (trustedErr) return { ok: false, error: trustedErr.message };

  let trusted: TrustedDomainRow;
  try {
    trusted = assertTrustedUrl(normalizedUrl, trustedRows ?? []);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Untrusted domain" };
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
    })
    .select("id")
    .single();

  if (jobErr || !job) return { ok: false, error: jobErr?.message ?? "Failed to create job" };

  await writeAudit("source_fetch_start", "source_fetch_job", job.id, {
    source_id: sourceId,
    normalized_url: normalizedUrl,
  });

  await supabase
    .from("source_fetch_jobs")
    .update({
      status_id: inProgressId,
      started_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  const outcome = await fetchTrustedPage(normalizedUrl, policy);

  if (!outcome.ok) {
    await supabase
      .from("source_fetch_jobs")
      .update({
        status_id: failedId,
        http_status: outcome.httpStatus,
        content_type: outcome.contentType,
        error_message: outcome.error,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    await writeAudit("source_fetch_failed", "source_fetch_job", job.id, {
      error: outcome.error,
    });

    return { ok: false, error: outcome.error, jobId: job.id };
  }

  const finalHost = hostnameFromUrl(outcome.finalUrl);
  if (!matchTrustedDomain(finalHost, trustedRows ?? [])) {
    const msg = `Redirect landed on untrusted domain: ${finalHost}`;
    await supabase
      .from("source_fetch_jobs")
      .update({
        status_id: failedId,
        http_status: outcome.httpStatus,
        content_type: outcome.contentType,
        error_message: msg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await writeAudit("source_fetch_failed", "source_fetch_job", job.id, { error: msg });
    return { ok: false, error: msg, jobId: job.id };
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
    await supabase
      .from("source_fetch_jobs")
      .update({
        status_id: failedId,
        error_message: versionErr?.message ?? "Version insert failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return { ok: false, error: versionErr?.message ?? "Version insert failed", jobId: job.id };
  }

  const extracted =
    outcome.contentType.includes("html")
      ? extractFromHtml(outcome.body, outcome.finalUrl)
      : extractFromPlainText(outcome.body, outcome.finalUrl);

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
    await supabase
      .from("source_fetch_jobs")
      .update({
        status_id: failedId,
        http_status: outcome.httpStatus,
        content_type: outcome.contentType,
        error_message: extractErr?.message ?? "Extraction save failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return {
      ok: false,
      error: extractErr?.message ?? "Extraction save failed",
      jobId: job.id,
    };
  }

  await supabase
    .from("source_fetch_jobs")
    .update({
      status_id: succeededId,
      http_status: outcome.httpStatus,
      content_type: outcome.contentType,
      completed_at: new Date().toISOString(),
      metadata: {
        final_url: outcome.finalUrl,
        bytes: outcome.body.length,
        source_version_id: version.id,
        extraction_id: extraction.id,
      },
    })
    .eq("id", job.id);

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

  return {
    ok: true,
    jobId: job.id,
    sourceVersionId: version.id,
    extractionId: extraction.id,
  };
}
