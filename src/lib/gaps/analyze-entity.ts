import { createClient } from "@/lib/supabase/server";
import { upsertKnowledgeGap } from "@/lib/gaps/persist-gap";
import type { GapCandidate } from "@/lib/gaps/types";

/** Entity-level gap analysis (subset of campaign rules). */
export async function analyzeEntityGaps(entityId: string, userId: string) {
  const supabase = await createClient();

  const { data: entity, error } = await supabase
    .from("entities")
    .select("id, canonical_slug, display_name, domain_id")
    .eq("id", entityId)
    .single();

  if (error || !entity) throw new Error("Entity not found");

  const candidates: GapCandidate[] = [];

  const { data: knowledge } = await supabase
    .from("knowledge_records")
    .select("id, title, confidence, source_version_id, source_id, structured_data")
    .eq("entity_id", entityId);

  const records = knowledge ?? [];

  if (records.length === 0) {
    candidates.push({
      gapTypeCode: "missing_entity",
      severityCode: "high",
      title: `No knowledge for ${entity.display_name}`,
      description: `Entity "${entity.canonical_slug}" has no knowledge records.`,
      entityId: entity.id,
      evidence: [
        {
          evidence_type: "entity",
          linked_entity_type: "entity",
          linked_entity_id: entity.id,
          evidence_summary: `Zero knowledge_records for entity_id=${entity.id}.`,
        },
      ],
    });
  } else {
    const knowledgeIds = records.map((k) => k.id);
    const { count: failureCount } = await supabase
      .from("knowledge_failure_links")
      .select("id", { count: "exact", head: true })
      .in("knowledge_record_id", knowledgeIds);

    if (!failureCount) {
      candidates.push({
        gapTypeCode: "missing_failure_modes",
        severityCode: "medium",
        title: `No failure modes for ${entity.display_name}`,
        description: "Knowledge exists without failure intelligence links.",
        entityId: entity.id,
        evidence: [
          {
            evidence_type: "knowledge_record",
            linked_entity_type: "knowledge_record",
            linked_entity_id: records[0].id,
            evidence_summary: `${records.length} record(s); no knowledge_failure_links.`,
          },
        ],
      });
    }
  }

  const gapIds: string[] = [];
  let created = 0;

  for (const candidate of candidates) {
    const fingerprint = `entity:${entityId}:${candidate.gapTypeCode}`;
    const result = await upsertKnowledgeGap({
      candidate,
      domainId: entity.domain_id,
      entityId: entity.id,
      detectionSource: "system",
      userId,
      fingerprint,
    });
    gapIds.push(result.gapId);
    if (result.created) created++;
  }

  return { detected: candidates.length, created, gapIds };
}
