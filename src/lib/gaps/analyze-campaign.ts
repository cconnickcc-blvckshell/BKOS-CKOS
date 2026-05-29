import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { resolveCampaignTargetEntities } from "@/lib/gaps/resolve-target-entities";
import { upsertKnowledgeGap } from "@/lib/gaps/persist-gap";
import type { AnalyzeCampaignResult, GapCandidate } from "@/lib/gaps/types";

const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;
const DEFAULT_STALE_DAYS = 180;

function joinOne<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export async function analyzeCampaignGaps(
  campaignId: string,
  userId: string
): Promise<AnalyzeCampaignResult> {
  const supabase = await createClient();

  const { data: campaign, error } = await supabase
    .from("curation_campaigns")
    .select("id, title, domain_id, target_entities, target_topics, inclusion_rules, metadata")
    .eq("id", campaignId)
    .single();

  if (error || !campaign) throw new Error("Campaign not found");

  const inclusion = (campaign.inclusion_rules as Record<string, unknown>) ?? {};
  const meta = (campaign.metadata as Record<string, unknown>) ?? {};
  const confidenceThreshold =
    Number(inclusion.confidence_threshold ?? meta.confidence_threshold) ||
    DEFAULT_CONFIDENCE_THRESHOLD;
  const staleDays =
    Number(inclusion.freshness_days ?? meta.freshness_days) || DEFAULT_STALE_DAYS;
  const staleBefore = daysAgo(staleDays);

  const targets = await resolveCampaignTargetEntities(
    campaign.target_entities,
    campaign.domain_id
  );

  const candidates: GapCandidate[] = [];

  for (const entity of targets) {
    const { data: knowledge } = await supabase
      .from("knowledge_records")
      .select("id, title, confidence, source_version_id, source_id, structured_data")
      .eq("entity_id", entity.id)
      .eq("domain_id", campaign.domain_id);

    const records = knowledge ?? [];

    if (records.length === 0) {
      candidates.push({
        gapTypeCode: "missing_entity",
        severityCode: "high",
        title: `No knowledge for ${entity.display_name}`,
        description: `Campaign target entity "${entity.canonical_slug}" has zero knowledge records in this domain.`,
        entityId: entity.id,
        evidence: [
          {
            evidence_type: "entity",
            linked_entity_type: "entity",
            linked_entity_id: entity.id,
            evidence_summary: `Entity ${entity.display_name} (${entity.canonical_slug}) has no knowledge_records.`,
          },
          {
            evidence_type: "campaign",
            linked_entity_type: "curation_campaign",
            linked_entity_id: campaignId,
            evidence_summary: `Listed in campaign "${campaign.title}" target_entities.`,
          },
        ],
        metadata: { entity_slug: entity.canonical_slug },
      });
      continue;
    }

    const knowledgeIds = records.map((k) => k.id);

    const { count: failureLinkCount } = await supabase
      .from("knowledge_failure_links")
      .select("id", { count: "exact", head: true })
      .in("knowledge_record_id", knowledgeIds);

    if (!failureLinkCount) {
      candidates.push({
        gapTypeCode: "missing_failure_modes",
        severityCode: "medium",
        title: `No failure coverage for ${entity.display_name}`,
        description: `${records.length} knowledge record(s) exist but none link to failure_records.`,
        entityId: entity.id,
        evidence: [
          {
            evidence_type: "knowledge_record",
            linked_entity_type: "knowledge_record",
            linked_entity_id: records[0].id,
            evidence_summary: `Sample knowledge: "${records[0].title}" — no knowledge_failure_links.`,
          },
          {
            evidence_type: "entity",
            linked_entity_type: "entity",
            linked_entity_id: entity.id,
            evidence_summary: `Entity has ${records.length} knowledge record(s) without failure links.`,
          },
        ],
      });
    }

    const { data: recipesByEntity } = await supabase
      .from("recipes")
      .select("id, title")
      .eq("entity_id", entity.id)
      .eq("domain_id", campaign.domain_id)
      .limit(1);

    const { count: recipeLinkCount } = await supabase
      .from("recipe_knowledge_links")
      .select("id", { count: "exact", head: true })
      .in("knowledge_record_id", knowledgeIds);

    if ((!recipesByEntity || recipesByEntity.length === 0) && !recipeLinkCount) {
      candidates.push({
        gapTypeCode: "missing_recipe",
        severityCode: "medium",
        title: `No recipes for ${entity.display_name}`,
        description: "No recipes linked by entity_id or recipe_knowledge_links.",
        entityId: entity.id,
        evidence: [
          {
            evidence_type: "entity",
            linked_entity_type: "entity",
            linked_entity_id: entity.id,
            evidence_summary: `Entity ${entity.canonical_slug} has knowledge but no recipes.`,
          },
        ],
      });
    }

    const { data: workflows } = await supabase
      .from("workflows")
      .select("id, title")
      .eq("entity_id", entity.id)
      .eq("domain_id", campaign.domain_id)
      .limit(1);

    if (!workflows?.length) {
      candidates.push({
        gapTypeCode: "missing_workflow",
        severityCode: "medium",
        title: `No workflows for ${entity.display_name}`,
        description: "No workflows with matching entity_id in campaign domain.",
        entityId: entity.id,
        evidence: [
          {
            evidence_type: "entity",
            linked_entity_type: "entity",
            linked_entity_id: entity.id,
            evidence_summary: `No workflows.entity_id match for ${entity.canonical_slug}.`,
          },
        ],
      });
    }

    for (const kr of records) {
      const structured = (kr.structured_data as Record<string, unknown>) ?? {};
      const normCitations = structured._normalization as { citations?: unknown[] } | undefined;
      const hasCitation =
        Boolean(kr.source_version_id) ||
        Boolean(kr.source_id) ||
        (Array.isArray(normCitations?.citations) && normCitations.citations.length > 0);

      if (!hasCitation) {
        candidates.push({
          gapTypeCode: "missing_citations",
          severityCode: "high",
          title: `Missing citations: ${kr.title}`,
          description: "Knowledge record lacks source_version_id and structured citations.",
          entityId: entity.id,
          evidence: [
            {
              evidence_type: "knowledge_record",
              linked_entity_type: "knowledge_record",
              linked_entity_id: kr.id,
              evidence_summary: `Record "${kr.title}" has no source_version_id or _normalization.citations.`,
            },
          ],
        });
      }

      if (kr.confidence != null && Number(kr.confidence) < confidenceThreshold) {
        candidates.push({
          gapTypeCode: "weak_confidence",
          severityCode: "medium",
          title: `Low confidence: ${kr.title}`,
          description: `Confidence ${kr.confidence} is below threshold ${confidenceThreshold}.`,
          entityId: entity.id,
          evidence: [
            {
              evidence_type: "knowledge_record",
              linked_entity_type: "knowledge_record",
              linked_entity_id: kr.id,
              evidence_summary: `confidence=${kr.confidence}, threshold=${confidenceThreshold}`,
            },
          ],
          metadata: { confidence: kr.confidence, threshold: confidenceThreshold },
        });
      }
    }
  }

  const { data: campaignSources } = await supabase
    .from("curation_campaign_sources")
    .select(
      `id, source_id, source_extraction_result_id, normalization_job_id,
       sources(id, title, url),
       source_extraction_results(
         id, source_version_id,
         source_versions(id, captured_at, version_number, source_id)
       )`
    )
    .eq("campaign_id", campaignId);

  for (const cs of campaignSources ?? []) {
    const source = joinOne<{ id: string; title: string; url: string | null }>(cs.sources);
    const sourceTitle = source?.title ?? "Source";

    const extraction = joinOne<{
      id: string;
      source_version_id: string;
      source_versions: { captured_at: string; version_number: number; source_id: string };
    }>(cs.source_extraction_results);

    if (extraction?.source_versions?.captured_at) {
      const captured = new Date(extraction.source_versions.captured_at);
      if (captured < staleBefore) {
        candidates.push({
          gapTypeCode: "stale_source",
          severityCode: "medium",
          title: `Stale source: ${sourceTitle}`,
          description: `Source version captured ${captured.toISOString().slice(0, 10)} (>${staleDays} days).`,
          evidence: [
            {
              evidence_type: "source_version",
              linked_entity_type: "source_version",
              linked_entity_id: extraction.source_version_id,
              evidence_summary: `Version ${extraction.source_versions.version_number} captured_at=${extraction.source_versions.captured_at}`,
            },
            {
              evidence_type: "campaign_source",
              linked_entity_type: "curation_campaign_source",
              linked_entity_id: cs.id as string,
              evidence_summary: `Campaign source row linked to stale version.`,
            },
          ],
          metadata: { stale_days: staleDays },
        });
      }
    }

    if (cs.source_extraction_result_id && !cs.normalization_job_id) {
      candidates.push({
        gapTypeCode: "missing_citations",
        severityCode: "medium",
        title: `Normalization needed: ${sourceTitle}`,
        description:
          "Extraction exists but no normalization job was created — publish path incomplete.",
        evidence: [
          {
            evidence_type: "source_extraction_result",
            linked_entity_type: "source_extraction_result",
            linked_entity_id: cs.source_extraction_result_id as string,
            evidence_summary: "Extraction ready; normalization_job_id is null on campaign source.",
          },
        ],
        metadata: { initial_status: "normalization_needed" },
      });
    }
  }

  if ((campaignSources ?? []).length === 0) {
    candidates.push({
      gapTypeCode: "missing_entity",
      severityCode: "high",
      title: "Campaign has no sources",
      description: "Add trusted URLs to the campaign before expecting knowledge coverage.",
      evidence: [
        {
          evidence_type: "campaign",
          linked_entity_type: "curation_campaign",
          linked_entity_id: campaignId,
          evidence_summary: `Campaign "${campaign.title}" has zero curation_campaign_sources.`,
        },
      ],
      metadata: { initial_status: "source_needed" },
    });
  }

  const gapIds: string[] = [];
  let created = 0;
  let updated = 0;

  for (const candidate of candidates) {
    const fingerprint = `${campaignId}:${candidate.gapTypeCode}:${candidate.entityId ?? "campaign"}:${candidate.title}`;
    const initialStatus =
      typeof candidate.metadata?.initial_status === "string"
        ? candidate.metadata.initial_status
        : undefined;

    const result = await upsertKnowledgeGap({
      candidate,
      domainId: campaign.domain_id,
      campaignId,
      entityId: candidate.entityId,
      detectionSource: "campaign",
      userId,
      fingerprint,
      initialStatusCode: initialStatus,
    });
    gapIds.push(result.gapId);
    if (result.created) created++;
    else updated++;
  }

  await writeAudit("campaign_gap_analysis", "curation_campaign", campaignId, {
    detected: candidates.length,
    created,
    updated,
  });

  return {
    detected: candidates.length,
    created,
    updated,
    gapIds,
  };
}
