import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { getCurationCampaignSourceStatusId } from "@/lib/curation/curation-status";

/** Sync campaign outputs from approved normalization + related links. */
export async function syncCampaignOutputs(campaignId: string, userId: string) {
  const supabase = await createClient();
  const entityStatusId = await getActiveStatusId();
  const approvedSourceStatusId = await getCurationCampaignSourceStatusId("approved");
  const embeddedSourceStatusId = await getCurationCampaignSourceStatusId("embedded");

  const { data: campaignSources } = await supabase
    .from("curation_campaign_sources")
    .select("id, normalization_job_id, source_extraction_result_id")
    .eq("campaign_id", campaignId);

  const normJobIds = (campaignSources ?? [])
    .map((s) => s.normalization_job_id)
    .filter((id): id is string => Boolean(id));

  if (normJobIds.length === 0) return { synced: 0 };

  const { data: outputs } = await supabase
    .from("normalization_job_outputs")
    .select(
      `id, normalization_job_id,
       normalization_statuses(code),
       normalization_review_decisions(decision, created_knowledge_record_id)`
    )
    .in("normalization_job_id", normJobIds);

  const knowledgeIds = new Set<string>();

  for (const out of outputs ?? []) {
    const decisions = out.normalization_review_decisions as {
      decision: string;
      created_knowledge_record_id: string | null;
    }[];
    const approved = decisions?.find(
      (d) => d.decision === "approved" && d.created_knowledge_record_id
    );
    if (approved?.created_knowledge_record_id) {
      knowledgeIds.add(approved.created_knowledge_record_id);
    }
  }

  let synced = 0;

  for (const knowledgeId of knowledgeIds) {
    const { error } = await supabase.from("curation_campaign_outputs").upsert(
      {
        campaign_id: campaignId,
        entity_type: "knowledge_record",
        entity_id: knowledgeId,
        output_role: "approved_knowledge",
        notes: "Synced from approved normalization output",
        created_by: userId,
        status: entityStatusId,
      },
      { onConflict: "campaign_id,entity_type,entity_id" }
    );
    if (!error) synced++;

    const { data: record } = await supabase
      .from("knowledge_records")
      .select("id, entity_id, title")
      .eq("id", knowledgeId)
      .maybeSingle();

    if (record?.entity_id) {
      await supabase.from("curation_campaign_outputs").upsert(
        {
          campaign_id: campaignId,
          entity_type: "entity",
          entity_id: record.entity_id,
          output_role: "linked_entity",
          notes: `Entity linked from knowledge: ${record.title}`,
          created_by: userId,
          status: entityStatusId,
        },
        { onConflict: "campaign_id,entity_type,entity_id" }
      );
    }

    const { data: failureLinks } = await supabase
      .from("knowledge_failure_links")
      .select("failure_id")
      .eq("knowledge_record_id", knowledgeId);

    for (const link of failureLinks ?? []) {
      await supabase.from("curation_campaign_outputs").upsert(
        {
          campaign_id: campaignId,
          entity_type: "failure_record",
          entity_id: link.failure_id,
          output_role: "related_failure",
          created_by: userId,
          status: entityStatusId,
        },
        { onConflict: "campaign_id,entity_type,entity_id" }
      );
    }

    const { data: recipeLinks } = await supabase
      .from("recipe_knowledge_links")
      .select("recipe_id")
      .eq("knowledge_record_id", knowledgeId);

    for (const link of recipeLinks ?? []) {
      await supabase.from("curation_campaign_outputs").upsert(
        {
          campaign_id: campaignId,
          entity_type: "recipe",
          entity_id: link.recipe_id,
          output_role: "related_recipe",
          created_by: userId,
          status: entityStatusId,
        },
        { onConflict: "campaign_id,entity_type,entity_id" }
      );
    }
  }

  for (const cs of campaignSources ?? []) {
    if (!cs.normalization_job_id) continue;
    const hasApproved = (outputs ?? []).some((o) => {
      if (o.normalization_job_id !== cs.normalization_job_id) return false;
      const decisions = o.normalization_review_decisions as {
        decision: string;
        created_knowledge_record_id: string | null;
      }[];
      return decisions?.some((d) => d.decision === "approved");
    });
    if (!hasApproved) continue;

    const approvedForJob = (outputs ?? []).find((o) => {
      if (o.normalization_job_id !== cs.normalization_job_id) return false;
      const decisions = o.normalization_review_decisions as {
        decision: string;
        created_knowledge_record_id: string | null;
      }[];
      return decisions?.find((d) => d.decision === "approved")?.created_knowledge_record_id;
    });
    const kid = (
      approvedForJob?.normalization_review_decisions as {
        decision: string;
        created_knowledge_record_id: string | null;
      }[]
    )?.find((d) => d.decision === "approved")?.created_knowledge_record_id;

    if (!kid) continue;

    const { data: embed } = await supabase
      .from("embeddings")
      .select("id")
      .eq("entity_type", "knowledge_record")
      .eq("entity_id", kid)
      .limit(1);

    await supabase
      .from("curation_campaign_sources")
      .update({
        status_id: embed?.length ? embeddedSourceStatusId : approvedSourceStatusId,
      })
      .eq("id", cs.id);
  }

  return { synced };
}
