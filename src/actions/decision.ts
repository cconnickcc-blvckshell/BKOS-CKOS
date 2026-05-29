"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { writeAudit } from "@/lib/audit";
import { getDecisionStatusId } from "@/lib/decision/decision-status";
import { buildDecisionRecommendation } from "@/lib/decision/build-recommendation";
import { inferHardwareTierCode } from "@/lib/decision/query-build";
import { z } from "zod";

export async function listDecisionStatuses() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decision_statuses")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listDecisionGoalTypes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decision_goal_types")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listDecisionConstraintTypes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decision_constraint_types")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listDecisionRequests(limit = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decision_requests")
    .select(
      `*,
      decision_statuses(id, code, label),
      decision_goal_types(id, code, label),
      hardware_tiers(id, code, label)`
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDecisionRequest(requestId: string) {
  const supabase = await createClient();
  const { data: request, error } = await supabase
    .from("decision_requests")
    .select(
      `*,
      decision_statuses(id, code, label),
      decision_goal_types(id, code, label, workflow_purpose_code),
      knowledge_domains(id, code, label),
      hardware_tiers(id, code, label, min_vram_gb)`
    )
    .eq("id", requestId)
    .single();

  if (error || !request) throw new Error("Decision request not found");

  const { data: constraints } = await supabase
    .from("decision_request_constraints")
    .select(
      `*,
      decision_constraint_types(id, code, label)`
    )
    .eq("decision_request_id", requestId);

  const { data: recommendation } = await supabase
    .from("decision_recommendations")
    .select(
      `*,
      decision_statuses(id, code, label)`
    )
    .eq("decision_request_id", requestId)
    .maybeSingle();

  let items: unknown[] = [];
  let sourceLinks: unknown[] = [];

  if (recommendation?.id) {
    const { data: itemRows } = await supabase
      .from("decision_recommendation_items")
      .select("*")
      .eq("decision_recommendation_id", recommendation.id)
      .order("sort_order");

    items = itemRows ?? [];

    const { data: links } = await supabase
      .from("decision_source_links")
      .select("*")
      .eq("decision_recommendation_id", recommendation.id)
      .order("sort_order");

    sourceLinks = links ?? [];
  }

  return {
    request,
    constraints: constraints ?? [],
    recommendation: recommendation ?? null,
    items,
    sourceLinks,
  };
}

const createRequestSchema = z.object({
  goal_text: z.string().min(8),
  goal_type_code: z.string().min(1),
  desired_output: z.string().optional(),
  domain_code: z.string().optional(),
  hardware_tier_code: z.string().optional(),
});

export async function createDecisionRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = createRequestSchema.safeParse({
    goal_text: formData.get("goal_text"),
    goal_type_code: formData.get("goal_type_code"),
    desired_output: formData.get("desired_output") || undefined,
    domain_code: formData.get("domain_code") || undefined,
    hardware_tier_code: formData.get("hardware_tier_code") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.message };

  try {
    const [{ data: goalType }, domainCode] = await Promise.all([
      supabase
        .from("decision_goal_types")
        .select("id, code, label")
        .eq("code", parsed.data.goal_type_code)
        .single(),
      parsed.data.domain_code ?? "comfyui",
    ]);

    if (!goalType) return { error: "Invalid goal type" };

    const { data: domain } = await supabase
      .from("knowledge_domains")
      .select("id")
      .eq("code", domainCode)
      .maybeSingle();

    let hardwareTierId: string | null = null;
    const tierCode =
      parsed.data.hardware_tier_code ||
      inferHardwareTierCode(parsed.data.goal_text, []);
    if (tierCode) {
      const { data: tier } = await supabase
        .from("hardware_tiers")
        .select("id")
        .eq("code", tierCode)
        .maybeSingle();
      hardwareTierId = tier?.id ?? null;
    }

    const pendingId = await getDecisionStatusId("pending");
    const entityStatusId = await getActiveStatusId();

    const { data: request, error: reqErr } = await supabase
      .from("decision_requests")
      .insert({
        status_id: pendingId,
        goal_type_id: goalType.id,
        goal_text: parsed.data.goal_text,
        desired_output: parsed.data.desired_output ?? null,
        domain_id: domain?.id ?? null,
        hardware_tier_id: hardwareTierId,
        requested_by: user.id,
        created_by: user.id,
        status: entityStatusId,
        metadata: { goal_type_code: goalType.code },
      })
      .select("id")
      .single();

    if (reqErr || !request) return { error: reqErr?.message ?? "Failed to create request" };

    const constraintEntries: { type: string; value: string }[] = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("constraint_") || typeof value !== "string") continue;
      const code = key.replace("constraint_", "");
      if (value.trim()) constraintEntries.push({ type: code, value: value.trim() });
    }

    if (constraintEntries.length > 0) {
      const { data: types } = await supabase
        .from("decision_constraint_types")
        .select("id, code")
        .in(
          "code",
          constraintEntries.map((c) => c.type)
        );

      const typeByCode = new Map((types ?? []).map((t) => [t.code, t.id]));
      const rows = constraintEntries
        .filter((c) => typeByCode.has(c.type))
        .map((c) => ({
          decision_request_id: request.id,
          constraint_type_id: typeByCode.get(c.type)!,
          value_text: c.value,
          created_by: user.id,
          status: entityStatusId,
        }));

      if (rows.length > 0) {
        await supabase.from("decision_request_constraints").insert(rows);
      }
    }

    await writeAudit("decision_request_create", "decision_request", request.id, {
      goal_type: goalType.code,
    });

    const build = await buildDecisionRecommendation(request.id, user.id);

    revalidatePath("/decision");
    revalidatePath(`/decision/${request.id}`);

    return {
      ok: true,
      requestId: request.id,
      recommendationId: build.recommendationId,
      statusCode: build.statusCode,
      confidence: build.confidence,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Create decision request failed" };
  }
}

export async function rebuildDecisionRecommendation(requestId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  try {
    const result = await buildDecisionRecommendation(requestId, user.id);
    revalidatePath(`/decision/${requestId}`);
    revalidatePath("/decision");
    return { ok: true, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Rebuild failed" };
  }
}

export async function listHardwareTiers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hardware_tiers")
    .select("id, code, label, min_vram_gb")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listKnowledgeDomains() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_domains")
    .select("id, code, label")
    .order("code");
  if (error) throw new Error(error.message);
  return data ?? [];
}
