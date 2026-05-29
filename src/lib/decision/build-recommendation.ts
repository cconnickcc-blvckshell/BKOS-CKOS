import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { writeAudit } from "@/lib/audit";
import { getDecisionStatusId } from "@/lib/decision/decision-status";
import {
  buildRetrievalQuery,
  extractModelFamilyHint,
  inferHardwareTierCode,
} from "@/lib/decision/query-build";
import type {
  BuildRecommendationResult,
  DecisionConstraintRow,
  DecisionGoalTypeRow,
  RetrievedFailure,
  RetrievedKnowledge,
  RetrievedRecipe,
  RetrievedWorkflow,
} from "@/lib/decision/types";

function one<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}

function hrefForEntity(type: string, id: string): string {
  switch (type) {
    case "knowledge_record":
      return `/knowledge/${id}`;
    case "workflow":
      return `/workflows/${id}`;
    case "workflow_analysis":
      return `/workflows/${id}`;
    case "failure_record":
      return `/failures/${id}`;
    case "recipe":
      return `/recipes/${id}`;
    default:
      return "#";
  }
}

async function searchKnowledge(
  query: string,
  limit: number
): Promise<RetrievedKnowledge[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("knowledge_records")
    .select("id, title, summary, knowledge_types(code, label)")
    .textSearch("search_vector", query, { type: "websearch", config: "english" })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    knowledge_types: one<{ code: string; label: string }>(r.knowledge_types),
  }));
}

async function searchRecipes(query: string, limit: number): Promise<RetrievedRecipe[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recipes")
    .select("id, title, objective")
    .textSearch("search_vector", query, { type: "websearch", config: "english" })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    objective: r.objective,
  }));
}

async function searchWorkflows(
  query: string,
  purposeCode: string | null,
  maxRequiredVram: number | null,
  limit: number
): Promise<RetrievedWorkflow[]> {
  const supabase = await createClient();

  const { data: workflows } = await supabase
    .from("workflows")
    .select("id, title, description")
    .textSearch("search_vector", query, { type: "websearch", config: "english" })
    .limit(limit * 2);

  if (!workflows?.length) return [];

  const ids = workflows.map((w) => w.id);
  let analysisQuery = supabase
    .from("workflow_analysis")
    .select(
      `id, workflow_id, hardware_requirement_id, workflow_purpose_id, complexity_score,
       hardware_tiers(code, label, min_vram_gb),
       workflow_purposes(code, label)`
    )
    .in("workflow_id", ids)
    .eq("is_current", true);

  if (purposeCode) {
    const { data: purpose } = await supabase
      .from("workflow_purposes")
      .select("id")
      .eq("code", purposeCode)
      .maybeSingle();
    if (purpose?.id) {
      analysisQuery = analysisQuery.eq("workflow_purpose_id", purpose.id);
    }
  }

  const { data: analyses } = await analysisQuery;

  const analysisByWorkflow = new Map(
    (analyses ?? []).map((a) => [a.workflow_id as string, a])
  );

  const results: RetrievedWorkflow[] = [];

  for (const w of workflows) {
    const raw = analysisByWorkflow.get(w.id);
    if (!raw) continue;

    const tier = one<{ code: string; label: string; min_vram_gb: number }>(
      raw.hardware_tiers
    );
    if (maxRequiredVram != null && tier && tier.min_vram_gb > maxRequiredVram) {
      continue;
    }

    results.push({
      id: w.id,
      title: w.title,
      description: w.description,
      analysis: {
        id: raw.id as string,
        hardware_requirement_id: raw.hardware_requirement_id as string,
        workflow_purpose_id: raw.workflow_purpose_id as string,
        complexity_score: Number(raw.complexity_score),
        hardware_tiers: tier!,
        workflow_purposes: one<{ code: string; label: string }>(raw.workflow_purposes)!,
      },
    });

    if (results.length >= limit) break;
  }

  return results;
}

async function searchFailures(
  query: string,
  limit: number
): Promise<RetrievedFailure[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("failure_records")
    .select("id, title, summary")
    .textSearch("search_vector", query, { type: "websearch", config: "english" })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
  }));
}

function computeMissingInformation(
  goalType: DecisionGoalTypeRow,
  constraints: DecisionConstraintRow[],
  counts: { knowledge: number; workflows: number; recipes: number }
): string[] {
  const missing: string[] = [];
  const has = (code: string) => constraints.some((c) => c.code === code);

  if (
    goalType.code === "maintain_character_consistency" &&
    !has("reference_character_available")
  ) {
    missing.push(
      "Reference character availability not specified — add reference_character_available constraint."
    );
  }
  if (goalType.code === "edit_existing_image" && !has("source_image_available")) {
    missing.push(
      "Source image availability not specified — add source_image_available constraint."
    );
  }
  if (!has("hardware") && goalType.code === "optimize_for_hardware") {
    missing.push("Hardware constraint missing for hardware optimization goal.");
  }
  if (counts.knowledge === 0) {
    missing.push("No matching knowledge records found in CKOS for this query.");
  }
  if (counts.workflows === 0 && counts.recipes === 0) {
    missing.push("No matching workflows or recipes found in CKOS for this query.");
  }

  return missing;
}

function computeConfidence(
  counts: {
    knowledge: number;
    workflows: number;
    recipes: number;
    failures: number;
  },
  missing: string[]
): number {
  if (counts.knowledge + counts.workflows + counts.recipes === 0) {
    return 0.12;
  }

  let score = 0.35;
  score += Math.min(0.25, counts.knowledge * 0.08);
  score += Math.min(0.2, counts.workflows * 0.1);
  score += Math.min(0.15, counts.recipes * 0.08);
  score += Math.min(0.05, counts.failures * 0.05);
  score -= Math.min(0.25, missing.length * 0.06);

  return Math.min(0.95, Math.max(0.15, Number(score.toFixed(3))));
}

function buildApproachText(
  goalType: DecisionGoalTypeRow,
  modelFamily: string | null,
  topRecipe: RetrievedRecipe | null,
  topWorkflow: RetrievedWorkflow | null
): string {
  const parts: string[] = [
    `Goal: ${goalType.label}.`,
  ];

  if (topRecipe) {
    parts.push(`Start from CKOS recipe "${topRecipe.title}" and adapt parameters to your constraints.`);
  } else if (topWorkflow) {
    parts.push(
      `Use CKOS workflow "${topWorkflow.title}" (${topWorkflow.analysis?.workflow_purposes.label ?? "analyzed pipeline"}) as the primary graph.`
    );
  } else {
    parts.push(
      "Insufficient workflow/recipe evidence — review linked knowledge records before building a pipeline."
    );
  }

  if (modelFamily) {
    parts.push(`Prefer model family: ${modelFamily} (from request text/constraints).`);
  }

  parts.push("This is a reviewable recommendation only — CKOS does not execute workflows.");

  return parts.join(" ");
}

export async function buildDecisionRecommendation(
  requestId: string,
  userId: string
): Promise<BuildRecommendationResult> {
  const supabase = await createClient();
  const entityStatusId = await getActiveStatusId();
  const inProgressId = await getDecisionStatusId("in_progress");

  await supabase
    .from("decision_requests")
    .update({ status_id: inProgressId })
    .eq("id", requestId);

  const { data: request, error: reqErr } = await supabase
    .from("decision_requests")
    .select(
      `*,
      decision_goal_types(id, code, label, workflow_purpose_code),
      hardware_tiers(id, code, label, min_vram_gb)`
    )
    .eq("id", requestId)
    .single();

  if (reqErr || !request) throw new Error("Decision request not found");

  const goalType = request.decision_goal_types as DecisionGoalTypeRow;

  const { data: constraintRows } = await supabase
    .from("decision_request_constraints")
    .select(
      `constraint_type_id, value_text, value_json,
       decision_constraint_types(code, label)`
    )
    .eq("decision_request_id", requestId);

  const constraints: DecisionConstraintRow[] = (constraintRows ?? []).map((r) => ({
    constraint_type_id: r.constraint_type_id as string,
    code: (one<{ code: string }>(r.decision_constraint_types) ?? { code: "" }).code,
    label: (one<{ label: string }>(r.decision_constraint_types) ?? { label: "" }).label,
    value_text: r.value_text as string | null,
    value_json: (r.value_json as Record<string, unknown>) ?? {},
  }));

  const query = buildRetrievalQuery(request.goal_text, goalType, constraints);
  const modelFamilyHint = extractModelFamilyHint(request.goal_text, constraints);

  let userMaxVram: number | null =
    (request.hardware_tiers as { min_vram_gb: number } | null)?.min_vram_gb ?? null;

  if (userMaxVram == null) {
    const tierCode = inferHardwareTierCode(request.goal_text, constraints);
    if (tierCode) {
      const { data: tier } = await supabase
        .from("hardware_tiers")
        .select("id, min_vram_gb")
        .eq("code", tierCode)
        .maybeSingle();
      if (tier) {
        userMaxVram = tier.min_vram_gb;
        await supabase
          .from("decision_requests")
          .update({ hardware_tier_id: tier.id })
          .eq("id", requestId);
      }
    }
  }

  const purposeCode = goalType.workflow_purpose_code;
  const troubleshoot = goalType.code === "troubleshoot_workflow";

  const [knowledge, recipes, workflows, failures] = await Promise.all([
    searchKnowledge(query, troubleshoot ? 8 : 5),
    searchRecipes(query, 3),
    searchWorkflows(
      query,
      troubleshoot ? null : purposeCode,
      userMaxVram,
      troubleshoot ? 2 : 3
    ),
    searchFailures(query, troubleshoot ? 5 : 2),
  ]);

  const missing = computeMissingInformation(goalType, constraints, {
    knowledge: knowledge.length,
    workflows: workflows.length,
    recipes: recipes.length,
  });

  const warnings: string[] = [];
  if (failures.length > 0) {
    warnings.push(
      `${failures.length} related failure record(s) in CKOS — review before running pipelines.`
    );
  }
  const platform = constraints.find((c) => c.code === "output_platform");
  if (platform?.value_text?.toLowerCase().includes("facebook")) {
    warnings.push(
      "Platform constraint mentions Facebook — verify safety/content policy knowledge before publishing assets."
    );
  }

  const confidence = computeConfidence(
    {
      knowledge: knowledge.length,
      workflows: workflows.length,
      recipes: recipes.length,
      failures: failures.length,
    },
    missing
  );

  const statusCode =
    knowledge.length + workflows.length + recipes.length === 0
      ? "insufficient_evidence"
      : "recommendation_ready";

  const readyId = await getDecisionStatusId(statusCode);
  const topRecipe = recipes[0] ?? null;
  const topWorkflow = workflows[0] ?? null;

  let suggestedModel = modelFamilyHint;
  if (!suggestedModel) {
    const modelKnowledge = knowledge.find(
      (k) =>
        k.knowledge_types?.code === "model" ||
        /\b(flux|sdxl|sd3|checkpoint|model)\b/i.test(k.title)
    );
    if (modelKnowledge) {
      suggestedModel = modelKnowledge.title.slice(0, 120);
    }
  }

  const approach = buildApproachText(goalType, suggestedModel, topRecipe, topWorkflow);

  const { data: existingRec } = await supabase
    .from("decision_recommendations")
    .select("id")
    .eq("decision_request_id", requestId)
    .maybeSingle();

  if (existingRec?.id) {
    await supabase
      .from("decision_source_links")
      .delete()
      .eq("decision_recommendation_id", existingRec.id);
    await supabase
      .from("decision_recommendation_items")
      .delete()
      .eq("decision_recommendation_id", existingRec.id);
    await supabase.from("decision_recommendations").delete().eq("id", existingRec.id);
  }

  const { data: rec, error: recErr } = await supabase
    .from("decision_recommendations")
    .insert({
      decision_request_id: requestId,
      status_id: readyId,
      confidence_score: confidence,
      recommended_approach: approach,
      suggested_model_family: suggestedModel,
      missing_information: missing,
      warnings,
      retrieval_metadata: {
        query,
        counts: {
          knowledge: knowledge.length,
          workflows: workflows.length,
          recipes: recipes.length,
          failures: failures.length,
        },
        user_max_vram_gb: userMaxVram,
        purpose_code: purposeCode,
      },
      created_by: userId,
      status: entityStatusId,
    })
    .select("id")
    .single();

  if (recErr || !rec) throw new Error(recErr?.message ?? "Failed to save recommendation");

  type ItemInsert = {
    item_role: string;
    title: string;
    summary: string | null;
    rationale: string;
    confidence_score: number;
    sort_order: number;
    knowledge_record_id?: string;
    workflow_id?: string;
    workflow_analysis_id?: string;
    failure_record_id?: string;
    recipe_id?: string;
  };

  const items: ItemInsert[] = [];
  let sort = 0;

  for (const k of knowledge.slice(0, 5)) {
    items.push({
      item_role: "knowledge_required",
      title: k.title,
      summary: k.summary,
      rationale: `Retrieved via full-text search for: "${query.slice(0, 120)}".`,
      confidence_score: confidence,
      sort_order: sort++,
      knowledge_record_id: k.id,
    });
  }

  for (const r of recipes) {
    items.push({
      item_role: "recipe",
      title: r.title,
      summary: r.objective,
      rationale: `Recipe matched retrieval query (rank ${sort}).`,
      confidence_score: confidence,
      sort_order: sort++,
      recipe_id: r.id,
    });
  }

  for (const w of workflows) {
    items.push({
      item_role: "workflow",
      title: w.title,
      summary: w.description,
      rationale: w.analysis
        ? `Workflow analysis: ${w.analysis.workflow_purposes.label}, min hardware ${w.analysis.hardware_tiers.label}.`
        : "Workflow matched retrieval query.",
      confidence_score: confidence,
      sort_order: sort++,
      workflow_id: w.id,
      workflow_analysis_id: w.analysis?.id,
    });
  }

  for (const f of failures) {
    items.push({
      item_role: "failure_warning",
      title: f.title,
      summary: f.summary,
      rationale: "Related failure intelligence retrieved for this goal.",
      confidence_score: Math.min(confidence, 0.85),
      sort_order: sort++,
      failure_record_id: f.id,
    });
  }

  const { data: insertedItems, error: itemsErr } = await supabase
    .from("decision_recommendation_items")
    .insert(
      items.map((item) => ({
        decision_recommendation_id: rec.id,
        ...item,
        created_by: userId,
        status: entityStatusId,
      }))
    )
    .select("id, item_role, knowledge_record_id, workflow_id, workflow_analysis_id, failure_record_id, recipe_id, title");

  if (itemsErr) throw new Error(itemsErr.message);

  const links: {
    decision_recommendation_id: string;
    decision_recommendation_item_id: string | null;
    linked_entity_type: string;
    linked_entity_id: string;
    citation_text: string;
    sort_order: number;
    created_by: string;
    status: string;
  }[] = [];

  let linkSort = 0;
  for (const item of insertedItems ?? []) {
    let entityType: string | null = null;
    let entityId: string | null = null;

    if (item.knowledge_record_id) {
      entityType = "knowledge_record";
      entityId = item.knowledge_record_id;
    } else if (item.recipe_id) {
      entityType = "recipe";
      entityId = item.recipe_id;
    } else if (item.workflow_id) {
      entityType = "workflow";
      entityId = item.workflow_id;
    } else if (item.workflow_analysis_id) {
      entityType = "workflow_analysis";
      entityId = item.workflow_analysis_id;
    } else if (item.failure_record_id) {
      entityType = "failure_record";
      entityId = item.failure_record_id;
    }

    if (!entityType || !entityId) continue;

    links.push({
      decision_recommendation_id: rec.id,
      decision_recommendation_item_id: item.id,
      linked_entity_type: entityType,
      linked_entity_id: entityId,
      citation_text: `${item.title} — ${hrefForEntity(entityType, entityId)}`,
      sort_order: linkSort++,
      created_by: userId,
      status: entityStatusId,
    });
  }

  if (links.length > 0) {
    await supabase.from("decision_source_links").insert(links);
  }

  await supabase
    .from("decision_requests")
    .update({ status_id: readyId })
    .eq("id", requestId);

  await writeAudit("decision_recommendation_build", "decision_recommendation", rec.id, {
    request_id: requestId,
    status: statusCode,
    item_count: insertedItems?.length ?? 0,
    confidence,
  });

  return {
    recommendationId: rec.id,
    confidence,
    statusCode,
    itemCount: insertedItems?.length ?? 0,
    linkCount: links.length,
  };
}
