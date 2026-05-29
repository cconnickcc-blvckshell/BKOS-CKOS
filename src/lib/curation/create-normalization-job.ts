import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { writeAudit } from "@/lib/audit";
import { getExtractionContext } from "@/actions/normalization";
import { getNormalizationStatusId } from "@/lib/normalization/normalization-status";
import { buildCitations } from "@/lib/normalization/citations";

export async function createNormalizationJobForExtraction(options: {
  extractionId: string;
  domainCode: string;
  templateCode: string;
  userId: string;
  campaignId?: string;
}): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  const supabase = await createClient();

  try {
    const ctx = await getExtractionContext(options.extractionId);

    const [{ data: template }, { data: domain }] = await Promise.all([
      supabase
        .from("normalization_templates")
        .select("*, knowledge_types(id, code, label)")
        .eq("code", options.templateCode)
        .single(),
      supabase
        .from("knowledge_domains")
        .select("id")
        .eq("code", options.domainCode)
        .single(),
    ]);

    if (!template || !domain) {
      return { ok: false, error: "Invalid template or domain" };
    }

    const inProgressId = await getNormalizationStatusId("in_progress");
    const draftReadyId = await getNormalizationStatusId("draft_ready");
    const pendingReviewId = await getNormalizationStatusId("pending_review");
    const entityStatusId = await getActiveStatusId();

    const { data: job, error: jobErr } = await supabase
      .from("normalization_jobs")
      .insert({
        source_extraction_result_id: options.extractionId,
        source_version_id: ctx.sourceVersionId,
        domain_id: domain.id,
        status_id: inProgressId,
        template_id: template.id,
        requested_by: options.userId,
        started_at: new Date().toISOString(),
        created_by: options.userId,
        status: entityStatusId,
        metadata: {
          template_code: template.code,
          curation_campaign_id: options.campaignId ?? null,
        },
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      return { ok: false, error: jobErr?.message ?? "Failed to create job" };
    }

    const ext = ctx.extraction as {
      title: string | null;
      summary: string | null;
      canonical_url: string | null;
    };

    const citations = buildCitations({
      source_id: ctx.sourceId,
      source_version_id: ctx.sourceVersionId,
      source_extraction_result_id: options.extractionId,
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
        created_by: options.userId,
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
      return { ok: false, error: outErr?.message ?? "Failed to create draft output" };
    }

    await supabase
      .from("normalization_jobs")
      .update({
        status_id: draftReadyId,
        completed_at: new Date().toISOString(),
        metadata: {
          template_code: template.code,
          output_id: output.id,
          curation_campaign_id: options.campaignId ?? null,
        },
      })
      .eq("id", job.id);

    await writeAudit("normalization_job_create", "normalization_job", job.id, {
      extraction_id: options.extractionId,
      template_code: template.code,
      curation_campaign_id: options.campaignId,
    });

    return { ok: true, jobId: job.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Create normalization job failed",
    };
  }
}
