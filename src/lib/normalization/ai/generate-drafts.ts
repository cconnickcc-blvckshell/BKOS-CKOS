import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { writeAudit } from "@/lib/audit";
import { getNormalizationStatusId } from "@/lib/normalization/normalization-status";
import { buildCitations } from "@/lib/normalization/citations";
import { renderPromptTemplate } from "@/lib/normalization/ai/prompt-render";
import { generateAiDraftJson, isAiProviderEnabled } from "@/lib/providers/ai";
import { resolveAiProviderForJob } from "@/lib/providers/ai/resolve-db-config";
import { getAiProviderStatusMessage } from "@/lib/providers/ai/config";
import {
  adjustConfidenceForQuotes,
  type SourceQuoteRef,
} from "@/lib/normalization/ai/quote-verify";
import type { AiProposalDraft, PromptTemplateRow } from "@/lib/normalization/ai/types";

function parseProposals(parsed: unknown): AiProposalDraft[] {
  if (!parsed || typeof parsed !== "object") return [];
  const obj = parsed as { proposals?: unknown };
  if (!Array.isArray(obj.proposals)) return [];

  return obj.proposals
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
    .map((p) => ({
      proposed_title: String(p.proposed_title ?? "").trim(),
      proposed_summary: p.proposed_summary != null ? String(p.proposed_summary) : null,
      proposed_structured_data:
        (p.proposed_structured_data as Record<string, unknown>) ?? {},
      proposed_entity_alias:
        p.proposed_entity_alias != null ? String(p.proposed_entity_alias) : null,
      confidence_score:
        typeof p.confidence_score === "number" ? p.confidence_score : undefined,
      extraction_notes:
        p.extraction_notes != null ? String(p.extraction_notes) : null,
      source_quote_refs: Array.isArray(p.source_quote_refs)
        ? (p.source_quote_refs as SourceQuoteRef[])
        : [],
    }))
    .filter((p) => p.proposed_title.length > 0);
}

export async function generateAiNormalizationDrafts(jobId: string, userId: string) {
  const supabase = await createClient();

  const { data: job, error: jobErr } = await supabase
    .from("normalization_jobs")
    .select(
      `*,
      normalization_templates(id, code, label, knowledge_type_id, default_structured_data),
      knowledge_domains(id, code, label),
      source_extraction_results(
        id, title, summary, extracted_markdown, extracted_text, canonical_url,
        source_versions(id, version_number, source_id, captured_at, sources(id, title))
      )`
    )
    .eq("id", jobId)
    .single();

  if (jobErr || !job) throw new Error("Normalization job not found");

  const template = job.normalization_templates as {
    id: string;
    code: string;
    label: string;
    knowledge_type_id: string;
    default_structured_data: Record<string, unknown>;
  };
  const domain = job.knowledge_domains as { code: string; label: string };
  const extraction = job.source_extraction_results as {
    id: string;
    title: string | null;
    summary: string | null;
    extracted_markdown: string | null;
    extracted_text: string | null;
    canonical_url: string | null;
    source_versions: {
      id: string;
      version_number: number;
      source_id: string;
      captured_at: string;
      sources: { id: string; title: string };
    };
  };

  const sourceText =
    extraction.extracted_markdown?.trim() ||
    extraction.extracted_text?.trim() ||
    "";
  if (!sourceText) {
    throw new Error("No extracted markdown or text available for AI drafting");
  }

  const { data: promptRow, error: promptErr } = await supabase
    .from("prompt_templates")
    .select("*")
    .eq("normalization_template_id", template.id)
    .maybeSingle();

  if (promptErr || !promptRow) {
    throw new Error(
      `No prompt template linked to normalization template "${template.code}"`
    );
  }

  const prompt = promptRow as PromptTemplateRow & {
    ai_provider_config_id: string;
  };

  if (!isAiProviderEnabled()) {
    const msg = getAiProviderStatusMessage();
    throw new Error(msg || "AI provider disabled");
  }

  const provider = await resolveAiProviderForJob();
  const inProgressId = await getNormalizationStatusId("in_progress");
  const succeededId = await getNormalizationStatusId("succeeded");
  const failedId = await getNormalizationStatusId("failed");
  const pendingReviewId = await getNormalizationStatusId("pending_review");
  const entityStatusId = await getActiveStatusId();

  const { data: aiRun, error: runErr } = await supabase
    .from("normalization_ai_runs")
    .insert({
      normalization_job_id: jobId,
      ai_provider_config_id: provider.id,
      prompt_template_id: prompt.id,
      status_id: inProgressId,
      requested_by: userId,
      started_at: new Date().toISOString(),
      created_by: userId,
      status: entityStatusId,
      metadata: { prompt_code: prompt.code, provider: provider.provider },
    })
    .select("id")
    .single();

  if (runErr || !aiRun) throw new Error(runErr?.message ?? "Failed to create AI run");

  await writeAudit("normalization_ai_run_start", "normalization_ai_run", aiRun.id, {
    job_id: jobId,
    prompt_code: prompt.code,
  });

  const citations = buildCitations({
    source_id: extraction.source_versions.source_id,
    source_version_id: extraction.source_versions.id,
    source_extraction_result_id: extraction.id,
    source_title: extraction.source_versions.sources.title,
    canonical_url: extraction.canonical_url,
    version_number: extraction.source_versions.version_number,
    captured_at: extraction.source_versions.captured_at,
  });

  try {
    const userPrompt = renderPromptTemplate(prompt.user_prompt_template, {
      template_label: template.label,
      domain_code: domain.code,
      source_title: extraction.title ?? extraction.source_versions.sources.title,
      source_text: sourceText.slice(0, 24000),
    });

    const { raw, parsed } = await generateAiDraftJson(
      prompt.system_prompt,
      userPrompt
    );

    const proposals = parseProposals(parsed);
    if (proposals.length === 0) {
      throw new Error("AI returned no valid proposals");
    }

    const outputIds: string[] = [];

    for (const proposal of proposals) {
      const refs = proposal.source_quote_refs ?? [];
      const { confidence, notes: quoteNote } = adjustConfidenceForQuotes(
        Math.min(1, Math.max(0, proposal.confidence_score ?? 0.5)),
        refs,
        sourceText
      );

      const extractionNotes = [proposal.extraction_notes, quoteNote]
        .filter(Boolean)
        .join(" ")
        .trim();

      const structured = {
        ...(template.default_structured_data ?? {}),
        ...(proposal.proposed_structured_data ?? {}),
        _ai: {
          prompt_code: prompt.code,
          run_id: aiRun.id,
          untrusted: true,
        },
      };

      const { data: out, error: outErr } = await supabase
        .from("normalization_job_outputs")
        .insert({
          normalization_job_id: jobId,
          proposed_record_type_id: template.knowledge_type_id,
          proposed_title: proposal.proposed_title,
          proposed_summary: proposal.proposed_summary ?? null,
          proposed_structured_data: structured,
          proposed_entity_alias: proposal.proposed_entity_alias ?? null,
          confidence_score: confidence,
          citations,
          extraction_notes: extractionNotes || "AI-generated draft — requires human review.",
          source_quote_refs: refs,
          normalization_ai_run_id: aiRun.id,
          is_ai_proposal: true,
          status_id: pendingReviewId,
          review_notes: "AI proposal — approve only after verifying source quotes.",
          created_by: userId,
          status: entityStatusId,
        })
        .select("id")
        .single();

      if (outErr || !out) throw new Error(outErr?.message ?? "Failed to save AI proposal");
      outputIds.push(out.id);
    }

    await supabase
      .from("normalization_ai_runs")
      .update({
        status_id: succeededId,
        raw_response: { text: raw, parsed },
        parsed_output_count: outputIds.length,
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", aiRun.id);

    await supabase
      .from("normalization_jobs")
      .update({
        status_id: await getNormalizationStatusId("draft_ready"),
        metadata: {
          ...(job.metadata as Record<string, unknown>),
          last_ai_run_id: aiRun.id,
          ai_output_count: outputIds.length,
        },
      })
      .eq("id", jobId);

    await writeAudit("normalization_ai_run_complete", "normalization_ai_run", aiRun.id, {
      job_id: jobId,
      output_ids: outputIds,
      count: outputIds.length,
    });

    return { runId: aiRun.id, outputIds, count: outputIds.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI draft generation failed";
    await supabase
      .from("normalization_ai_runs")
      .update({
        status_id: failedId,
        error_message: msg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", aiRun.id);
    await writeAudit("normalization_ai_run_failed", "normalization_ai_run", aiRun.id, {
      error: msg,
    });
    throw new Error(msg);
  }
}
