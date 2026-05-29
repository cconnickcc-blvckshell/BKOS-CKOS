import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { getGapSeverityId, getGapStatusId, getGapType } from "@/lib/gaps/gap-lookup";
import type { GapCandidate } from "@/lib/gaps/types";

export async function upsertKnowledgeGap(options: {
  candidate: GapCandidate;
  domainId: string;
  campaignId?: string;
  entityId?: string;
  detectionSource: "manual" | "system" | "campaign";
  userId: string;
  fingerprint: string;
  initialStatusCode?: string;
}): Promise<{ gapId: string; created: boolean }> {
  const supabase = await createClient();
  const entityStatusId = await getActiveStatusId();
  const newStatusId = await getGapStatusId(options.initialStatusCode ?? "open");
  const gapType = await getGapType(options.candidate.gapTypeCode);
  const severityCode =
    options.candidate.severityCode || gapType.default_severity_code || "medium";
  const severityId = await getGapSeverityId(severityCode);

  let existingQuery = supabase
    .from("knowledge_gaps")
    .select("id, status_id")
    .eq("gap_type_id", gapType.id)
    .contains("metadata", { fingerprint: options.fingerprint });

  if (options.campaignId) {
    existingQuery = existingQuery.eq("campaign_id", options.campaignId);
  } else {
    existingQuery = existingQuery.is("campaign_id", null);
  }

  if (options.entityId ?? options.candidate.entityId) {
    existingQuery = existingQuery.eq(
      "entity_id",
      options.entityId ?? options.candidate.entityId!
    );
  } else {
    existingQuery = existingQuery.is("entity_id", null);
  }

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing?.id) {
    await supabase
      .from("knowledge_gaps")
      .update({
        title: options.candidate.title,
        description: options.candidate.description,
        severity_id: severityId,
        metadata: {
          ...options.candidate.metadata,
          fingerprint: options.fingerprint,
          last_analyzed_at: new Date().toISOString(),
        },
      })
      .eq("id", existing.id);

    await supabase.from("knowledge_gap_evidence").delete().eq("knowledge_gap_id", existing.id);

    if (options.candidate.evidence.length > 0) {
      await supabase.from("knowledge_gap_evidence").insert(
        options.candidate.evidence.map((e, i) => ({
          knowledge_gap_id: existing.id,
          evidence_type: e.evidence_type,
          linked_entity_type: e.linked_entity_type ?? null,
          linked_entity_id: e.linked_entity_id ?? null,
          evidence_summary: e.evidence_summary,
          sort_order: i,
          created_by: options.userId,
          status: entityStatusId,
        }))
      );
    }

    return { gapId: existing.id, created: false };
  }

  const { data: gap, error } = await supabase
    .from("knowledge_gaps")
    .insert({
      gap_type_id: gapType.id,
      status_id: newStatusId,
      severity_id: severityId,
      domain_id: options.domainId,
      entity_id: options.entityId ?? options.candidate.entityId ?? null,
      campaign_id: options.campaignId ?? null,
      title: options.candidate.title,
      description: options.candidate.description,
      detection_source: options.detectionSource,
      metadata: {
        ...options.candidate.metadata,
        fingerprint: options.fingerprint,
        analyzed_at: new Date().toISOString(),
      },
      created_by: options.userId,
      status: entityStatusId,
    })
    .select("id")
    .single();

  if (error || !gap) throw new Error(error?.message ?? "Failed to persist gap");

  if (options.candidate.evidence.length === 0) {
    throw new Error("Gap must include at least one evidence record");
  }

  await supabase.from("knowledge_gap_evidence").insert(
    options.candidate.evidence.map((e, i) => ({
      knowledge_gap_id: gap.id,
      evidence_type: e.evidence_type,
      linked_entity_type: e.linked_entity_type ?? null,
      linked_entity_id: e.linked_entity_id ?? null,
      evidence_summary: e.evidence_summary,
      sort_order: i,
      created_by: options.userId,
      status: entityStatusId,
    }))
  );

  if (options.campaignId) {
    await supabase.from("campaign_gap_links").upsert(
      {
        campaign_id: options.campaignId,
        knowledge_gap_id: gap.id,
        created_by: options.userId,
      },
      { onConflict: "campaign_id,knowledge_gap_id" }
    );
  }

  const eid = options.entityId ?? options.candidate.entityId;
  if (eid) {
    await supabase.from("entity_gap_links").upsert(
      {
        entity_id: eid,
        knowledge_gap_id: gap.id,
        created_by: options.userId,
      },
      { onConflict: "entity_id,knowledge_gap_id" }
    );
  }

  return { gapId: gap.id, created: true };
}
