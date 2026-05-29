"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

export async function listSeverityLevels() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("severity_levels")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data;
}

export async function listFailureCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("failure_categories")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data;
}

export async function listFailures(domainCode?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("failure_records")
    .select(
      `*, severity_levels(id, code, label),
       failure_categories(id, code, label),
       knowledge_domains(id, code, label),
       entities(id, canonical_slug, display_name)`
    )
    .order("updated_at", { ascending: false });

  if (domainCode) {
    const { data: domain } = await supabase
      .from("knowledge_domains")
      .select("id")
      .eq("code", domainCode)
      .single();
    if (domain) query = query.eq("domain_id", domain.id);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const ids = data?.map((f) => f.id) ?? [];
  if (ids.length === 0) return data ?? [];

  const [{ data: causeCounts }, { data: fixCounts }] = await Promise.all([
    supabase.from("failure_causes").select("failure_id").in("failure_id", ids),
    supabase.from("failure_fixes").select("failure_id").in("failure_id", ids),
  ]);

  const causeMap = new Map<string, number>();
  const fixMap = new Map<string, number>();
  causeCounts?.forEach((r) =>
    causeMap.set(r.failure_id, (causeMap.get(r.failure_id) ?? 0) + 1)
  );
  fixCounts?.forEach((r) =>
    fixMap.set(r.failure_id, (fixMap.get(r.failure_id) ?? 0) + 1)
  );

  return (data ?? []).map((f) => ({
    ...f,
    cause_count: causeMap.get(f.id) ?? 0,
    fix_count: fixMap.get(f.id) ?? 0,
  }));
}

export async function getFailure(id: string) {
  const supabase = await createClient();

  const { data: failure, error } = await supabase
    .from("failure_records")
    .select(
      `*, severity_levels(id, code, label),
       failure_categories(id, code, label),
       knowledge_domains(id, code, label),
       entities(id, canonical_slug, display_name)`
    )
    .eq("id", id)
    .single();

  if (error || !failure) throw new Error("Failure not found");

  const [
    { data: causes },
    { data: fixes },
    { data: workflowLinks },
    { data: knowledgeLinks },
  ] = await Promise.all([
    supabase
      .from("failure_causes")
      .select("*")
      .eq("failure_id", id)
      .order("sort_order"),
    supabase
      .from("failure_fixes")
      .select("*")
      .eq("failure_id", id)
      .order("sort_order"),
    supabase
      .from("workflow_failure_links")
      .select("*, workflows(id, title)")
      .eq("failure_id", id),
    supabase
      .from("knowledge_failure_links")
      .select("*, knowledge_records(id, title)")
      .eq("failure_id", id),
  ]);

  return {
    failure,
    causes: causes ?? [],
    fixes: fixes ?? [],
    workflowLinks: workflowLinks ?? [],
    knowledgeLinks: knowledgeLinks ?? [],
  };
}

const failureSchema = z.object({
  domain_code: z.string().min(1),
  symptom: z.string().min(1),
  description: z.string().optional(),
  severity_level_code: z.string().min(1),
  category_code: z.string().min(1),
  entity_id: z.string().uuid().optional().or(z.literal("")),
  probability_score: z.coerce.number().min(0).max(1).optional(),
  detection_signals: z.string().optional(),
});

async function resolveLookupIds(
  domainCode: string,
  severityCode: string,
  categoryCode: string
) {
  const supabase = await createClient();
  const [{ data: domain }, { data: severity }, { data: category }] =
    await Promise.all([
      supabase.from("knowledge_domains").select("id").eq("code", domainCode).single(),
      supabase.from("severity_levels").select("id").eq("code", severityCode).single(),
      supabase.from("failure_categories").select("id").eq("code", categoryCode).single(),
    ]);

  if (!domain) throw new Error("Invalid domain");
  if (!severity) throw new Error("Invalid severity level");
  if (!category) throw new Error("Invalid category");

  return { domainId: domain.id, severityId: severity.id, categoryId: category.id };
}

export async function createFailure(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = failureSchema.safeParse({
    domain_code: formData.get("domain_code"),
    symptom: formData.get("symptom"),
    description: formData.get("description") || undefined,
    severity_level_code: formData.get("severity_level_code"),
    category_code: formData.get("category_code"),
    entity_id: formData.get("entity_id") || undefined,
    probability_score: formData.get("probability_score") || undefined,
    detection_signals: formData.get("detection_signals") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.message };

  let detectionSignals = {};
  if (parsed.data.detection_signals) {
    try {
      detectionSignals = JSON.parse(parsed.data.detection_signals);
    } catch {
      return { error: "Invalid detection_signals JSON" };
    }
  }

  const { domainId, severityId, categoryId } = await resolveLookupIds(
    parsed.data.domain_code,
    parsed.data.severity_level_code,
    parsed.data.category_code
  );

  const statusId = await getActiveStatusId();
  const { data, error } = await supabase
    .from("failure_records")
    .insert({
      domain_id: domainId,
      symptom: parsed.data.symptom,
      description: parsed.data.description ?? null,
      severity_level_id: severityId,
      category_id: categoryId,
      entity_id: parsed.data.entity_id || null,
      probability_score: parsed.data.probability_score ?? null,
      detection_signals: detectionSignals,
      created_by: user.id,
      status: statusId,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const { enqueueEmbeddingJob } = await import("@/lib/embeddings/queue");
  await enqueueEmbeddingJob({
    entityType: "failure_record",
    entityId: data.id,
    userId: user.id,
  });

  await writeAudit("create", "failure_record", data.id, parsed.data);
  revalidatePath("/failures");
  return { id: data.id };
}

export async function updateFailure(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = failureSchema.safeParse({
    domain_code: formData.get("domain_code"),
    symptom: formData.get("symptom"),
    description: formData.get("description") || undefined,
    severity_level_code: formData.get("severity_level_code"),
    category_code: formData.get("category_code"),
    entity_id: formData.get("entity_id") || undefined,
    probability_score: formData.get("probability_score") || undefined,
    detection_signals: formData.get("detection_signals") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.message };

  let detectionSignals = {};
  if (parsed.data.detection_signals) {
    try {
      detectionSignals = JSON.parse(parsed.data.detection_signals);
    } catch {
      return { error: "Invalid detection_signals JSON" };
    }
  }

  const { domainId, severityId, categoryId } = await resolveLookupIds(
    parsed.data.domain_code,
    parsed.data.severity_level_code,
    parsed.data.category_code
  );

  const { error } = await supabase
    .from("failure_records")
    .update({
      domain_id: domainId,
      symptom: parsed.data.symptom,
      description: parsed.data.description ?? null,
      severity_level_id: severityId,
      category_id: categoryId,
      entity_id: parsed.data.entity_id || null,
      probability_score: parsed.data.probability_score ?? null,
      detection_signals: detectionSignals,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  const { enqueueEmbeddingJob } = await import("@/lib/embeddings/queue");
  await enqueueEmbeddingJob({
    entityType: "failure_record",
    entityId: id,
    userId: user.id,
  });

  await writeAudit("update", "failure_record", id, parsed.data);
  revalidatePath(`/failures/${id}`);
  revalidatePath("/failures");
  return { ok: true };
}

export async function createFailureCause(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const failureId = formData.get("failure_id") as string;
  const statusId = await getActiveStatusId();

  const { error } = await supabase.from("failure_causes").insert({
    failure_id: failureId,
    cause: formData.get("cause") as string,
    confidence_score: formData.get("confidence_score")
      ? Number(formData.get("confidence_score"))
      : null,
    evidence: (formData.get("evidence") as string) || null,
    sort_order: Number(formData.get("sort_order") ?? 0),
    created_by: user.id,
    status: statusId,
  });

  if (error) return { error: error.message };
  revalidatePath(`/failures/${failureId}`);
  return { ok: true };
}

export async function deleteFailureCause(id: string, failureId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("failure_causes").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/failures/${failureId}`);
  return { ok: true };
}

export async function createFailureFix(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const failureId = formData.get("failure_id") as string;
  const statusId = await getActiveStatusId();

  const { error } = await supabase.from("failure_fixes").insert({
    failure_id: failureId,
    recommended_fix: formData.get("recommended_fix") as string,
    effectiveness_score: formData.get("effectiveness_score")
      ? Number(formData.get("effectiveness_score"))
      : null,
    risk_level: (formData.get("risk_level") as string) || null,
    notes: (formData.get("notes") as string) || null,
    sort_order: Number(formData.get("sort_order") ?? 0),
    created_by: user.id,
    status: statusId,
  });

  if (error) return { error: error.message };
  revalidatePath(`/failures/${failureId}`);
  return { ok: true };
}

export async function deleteFailureFix(id: string, failureId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("failure_fixes").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/failures/${failureId}`);
  return { ok: true };
}

export async function linkWorkflowFailure(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const failureId = formData.get("failure_id") as string;
  const workflowId = formData.get("workflow_id") as string;
  const statusId = await getActiveStatusId();

  const { error } = await supabase.from("workflow_failure_links").insert({
    failure_id: failureId,
    workflow_id: workflowId,
    likelihood_score: formData.get("likelihood_score")
      ? Number(formData.get("likelihood_score"))
      : null,
    notes: (formData.get("notes") as string) || null,
    created_by: user.id,
    status: statusId,
  });

  if (error) return { error: error.message };
  revalidatePath(`/failures/${failureId}`);
  return { ok: true };
}

export async function unlinkWorkflowFailure(
  linkId: string,
  failureId: string
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workflow_failure_links")
    .delete()
    .eq("id", linkId);
  if (error) return { error: error.message };
  revalidatePath(`/failures/${failureId}`);
  return { ok: true };
}

export async function linkKnowledgeFailure(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const failureId = formData.get("failure_id") as string;
  const knowledgeRecordId = formData.get("knowledge_record_id") as string;
  const statusId = await getActiveStatusId();

  const { error } = await supabase.from("knowledge_failure_links").insert({
    failure_id: failureId,
    knowledge_record_id: knowledgeRecordId,
    relationship_notes: (formData.get("relationship_notes") as string) || null,
    created_by: user.id,
    status: statusId,
  });

  if (error) return { error: error.message };
  revalidatePath(`/failures/${failureId}`);
  return { ok: true };
}

export async function unlinkKnowledgeFailure(
  linkId: string,
  failureId: string
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("knowledge_failure_links")
    .delete()
    .eq("id", linkId);
  if (error) return { error: error.message };
  revalidatePath(`/failures/${failureId}`);
  return { ok: true };
}

export async function listWorkflowsForLink() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflows")
    .select("id, title")
    .order("title")
    .limit(200);
  if (error) throw new Error(error.message);
  return data;
}

export async function listKnowledgeForLink() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_records")
    .select("id, title")
    .order("title")
    .limit(200);
  if (error) throw new Error(error.message);
  return data;
}
