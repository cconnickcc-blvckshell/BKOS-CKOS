"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getGapStatusId } from "@/lib/gaps/gap-lookup";
import { analyzeCampaignGaps } from "@/lib/gaps/analyze-campaign";
import { analyzeEntityGaps } from "@/lib/gaps/analyze-entity";
import { upsertKnowledgeGap } from "@/lib/gaps/persist-gap";
import { z } from "zod";

export async function listGapStatuses() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("gap_statuses").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listGapSeverityLevels() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gap_severity_levels")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listGapTypes() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("gap_types").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listKnowledgeGaps(limit = 100) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_gaps")
    .select(
      `*,
      gap_types(id, code, label),
      gap_statuses(id, code, label),
      gap_severity_levels(id, code, label),
      knowledge_domains(id, code, label),
      entities(id, canonical_slug, display_name),
      curation_campaigns(id, title)`
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listKnowledgeGapsForCampaign(campaignId: string) {
  const supabase = await createClient();
  const { data: links } = await supabase
    .from("campaign_gap_links")
    .select("knowledge_gap_id")
    .eq("campaign_id", campaignId);

  const ids = (links ?? []).map((l) => l.knowledge_gap_id);
  if (ids.length === 0) {
    const { data: direct } = await supabase
      .from("knowledge_gaps")
      .select(
        `*,
        gap_types(id, code, label),
        gap_statuses(id, code, label),
        gap_severity_levels(id, code, label)`
      )
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });
    return direct ?? [];
  }

  const { data, error } = await supabase
    .from("knowledge_gaps")
    .select(
      `*,
      gap_types(id, code, label),
      gap_statuses(id, code, label),
      gap_severity_levels(id, code, label)`
    )
    .in("id", ids)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listKnowledgeGapsForEntity(entityId: string) {
  const supabase = await createClient();
  const { data: links } = await supabase
    .from("entity_gap_links")
    .select("knowledge_gap_id")
    .eq("entity_id", entityId);

  const ids = (links ?? []).map((l) => l.knowledge_gap_id);

  const { data: byEntity, error: e1 } = await supabase
    .from("knowledge_gaps")
    .select(
      `*,
      gap_types(id, code, label),
      gap_statuses(id, code, label),
      gap_severity_levels(id, code, label)`
    )
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (e1) throw new Error(e1.message);

  if (ids.length === 0) return byEntity ?? [];

  const { data: byLink, error: e2 } = await supabase
    .from("knowledge_gaps")
    .select(
      `*,
      gap_types(id, code, label),
      gap_statuses(id, code, label),
      gap_severity_levels(id, code, label)`
    )
    .in("id", ids);

  if (e2) throw new Error(e2.message);

  const merged = new Map<string, (typeof byEntity)[0]>();
  for (const g of [...(byEntity ?? []), ...(byLink ?? [])]) {
    merged.set(g.id, g);
  }
  return [...merged.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function getKnowledgeGap(gapId: string) {
  const supabase = await createClient();
  const { data: gap, error } = await supabase
    .from("knowledge_gaps")
    .select(
      `*,
      gap_types(id, code, label),
      gap_statuses(id, code, label),
      gap_severity_levels(id, code, label),
      knowledge_domains(id, code, label),
      entities(id, canonical_slug, display_name),
      curation_campaigns(id, title)`
    )
    .eq("id", gapId)
    .single();

  if (error || !gap) throw new Error("Gap not found");

  const { data: evidence } = await supabase
    .from("knowledge_gap_evidence")
    .select("*")
    .eq("knowledge_gap_id", gapId)
    .order("sort_order");

  return { gap, evidence: evidence ?? [] };
}

export async function runCampaignGapAnalysis(campaignId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  try {
    const result = await analyzeCampaignGaps(campaignId, user.id);
    revalidatePath(`/curation/${campaignId}`);
    revalidatePath("/gaps");
    return { ok: true, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gap analysis failed" };
  }
}

export async function runEntityGapAnalysis(entityId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  try {
    const result = await analyzeEntityGaps(entityId, user.id);
    revalidatePath(`/entities/${entityId}`);
    revalidatePath("/gaps");
    return { ok: true, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gap analysis failed" };
  }
}

const resolveGapSchema = z.object({
  status_code: z.string().min(1),
  resolution_notes: z.string().optional(),
});

export async function updateGapResolution(gapId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = resolveGapSchema.safeParse({
    status_code: formData.get("status_code"),
    resolution_notes: formData.get("resolution_notes") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.message };

  const statusId = await getGapStatusId(parsed.data.status_code);
  const updates: Record<string, unknown> = {
    status_id: statusId,
    resolution_notes: parsed.data.resolution_notes ?? null,
  };

  if (parsed.data.status_code === "resolved" || parsed.data.status_code === "dismissed") {
    updates.resolved_at = new Date().toISOString();
  } else {
    updates.resolved_at = null;
  }

  const { data: gap, error } = await supabase
    .from("knowledge_gaps")
    .update(updates)
    .eq("id", gapId)
    .select("campaign_id, entity_id")
    .single();

  if (error) return { error: error.message };

  await writeAudit("knowledge_gap_resolve", "knowledge_gap", gapId, {
    status: parsed.data.status_code,
  });

  revalidatePath("/gaps");
  revalidatePath(`/gaps/${gapId}`);
  if (gap?.campaign_id) revalidatePath(`/curation/${gap.campaign_id}`);
  if (gap?.entity_id) revalidatePath(`/entities/${gap.entity_id}`);

  return { ok: true };
}

const manualGapSchema = z.object({
  gap_type_code: z.string().min(1),
  severity_code: z.string().min(1),
  title: z.string().min(3),
  description: z.string().optional(),
  domain_code: z.string().optional(),
  entity_id: z.string().uuid().optional(),
  campaign_id: z.string().uuid().optional(),
  evidence_summary: z.string().min(10),
});

export async function createManualKnowledgeGap(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = manualGapSchema.safeParse({
    gap_type_code: formData.get("gap_type_code"),
    severity_code: formData.get("severity_code"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    domain_code: formData.get("domain_code") || undefined,
    entity_id: formData.get("entity_id") || undefined,
    campaign_id: formData.get("campaign_id") || undefined,
    evidence_summary: formData.get("evidence_summary"),
  });

  if (!parsed.success) return { error: parsed.error.message };

  let domainId: string | null = null;
  if (parsed.data.domain_code) {
    const { data: domain } = await supabase
      .from("knowledge_domains")
      .select("id")
      .eq("code", parsed.data.domain_code)
      .single();
    domainId = domain?.id ?? null;
  }

  if (!domainId && parsed.data.entity_id) {
    const { data: ent } = await supabase
      .from("entities")
      .select("domain_id")
      .eq("id", parsed.data.entity_id)
      .single();
    domainId = ent?.domain_id ?? null;
  }

  if (!domainId) return { error: "Domain required" };

  const result = await upsertKnowledgeGap({
    candidate: {
      gapTypeCode: parsed.data.gap_type_code,
      severityCode: parsed.data.severity_code,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      entityId: parsed.data.entity_id,
      evidence: [
        {
          evidence_type: "manual",
          evidence_summary: parsed.data.evidence_summary,
        },
      ],
    },
    domainId,
    campaignId: parsed.data.campaign_id,
    entityId: parsed.data.entity_id,
    detectionSource: "manual",
    userId: user.id,
    fingerprint: `manual:${Date.now()}:${parsed.data.title}`,
  });

  revalidatePath("/gaps");
  return { ok: true, gapId: result.gapId };
}
