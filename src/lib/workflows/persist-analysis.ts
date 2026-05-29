import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { analyzeWorkflow, type LookupRow, type PurposeSignalRow } from "@/lib/workflows/analyze-workflow";
import { parseComfyWorkflow } from "@/lib/workflows/parser";

export async function loadAnalysisLookups() {
  const supabase = await createClient();

  const [
    { data: complexityLevels },
    { data: hardwareTiers },
    { data: purposeSignals },
    { data: purposes },
  ] = await Promise.all([
    supabase.from("complexity_levels").select("id, code, label, min_score, sort_order"),
    supabase.from("hardware_tiers").select("id, code, label, min_vram_gb, sort_order"),
    supabase
      .from("workflow_purpose_signals")
      .select("pattern, weight, workflow_purposes(code)"),
    supabase.from("workflow_purposes").select("id, code"),
  ]);

  return {
    complexityLevels: (complexityLevels ?? []) as LookupRow[],
    hardwareTiers: (hardwareTiers ?? []) as LookupRow[],
    purposeSignals: (purposeSignals ?? []) as PurposeSignalRow[],
    purposes: purposes ?? [],
  };
}

function idByCode(rows: { id: string; code: string }[], code: string): string {
  const row = rows.find((r) => r.code === code);
  if (!row) throw new Error(`Lookup code not found: ${code}`);
  return row.id;
}

export async function runWorkflowAnalysis(
  workflowId: string,
  workflowJson: Record<string, unknown>,
  userId: string | null
) {
  const supabase = await createClient();
  const lookups = await loadAnalysisLookups();
  const parsed = parseComfyWorkflow(workflowJson);
  const result = analyzeWorkflow(parsed, lookups);
  const statusId = await getActiveStatusId();

  await supabase.from("workflow_edges").delete().eq("workflow_id", workflowId);

  if (parsed.edges.length > 0) {
    await supabase.from("workflow_edges").insert(
      parsed.edges.map((e) => ({
        workflow_id: workflowId,
        from_node_key: e.from_node_key,
        to_node_key: e.to_node_key,
        input_slot: e.input_slot,
        created_by: userId,
        status: statusId,
      }))
    );
  }

  await supabase
    .from("workflow_analysis")
    .update({ is_current: false })
    .eq("workflow_id", workflowId)
    .eq("is_current", true);

  const complexityLevelId = idByCode(
    lookups.complexityLevels as { id: string; code: string }[],
    result.complexity_level_code
  );
  const purposeId = idByCode(lookups.purposes, result.workflow_purpose_code);
  const hardwareId = idByCode(
    lookups.hardwareTiers as { id: string; code: string }[],
    result.hardware_tier_code
  );

  const { data: analysis, error } = await supabase
    .from("workflow_analysis")
    .insert({
      workflow_id: workflowId,
      complexity_score: result.complexity_score,
      complexity_level_id: complexityLevelId,
      workflow_purpose_id: purposeId,
      hardware_requirement_id: hardwareId,
      node_count: result.node_count,
      custom_node_count: result.custom_node_count,
      model_count: result.model_count,
      controlnet_count: result.controlnet_count,
      lora_count: result.lora_count,
      video_capable: result.video_capable,
      graph_depth: result.graph_depth,
      branch_count: result.branch_count,
      upscale_stage_count: result.upscale_stage_count,
      analysis_version: result.analysis_version,
      analysis_metadata: result.analysis_metadata,
      is_current: true,
      created_by: userId,
      status: statusId,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await supabase
    .from("workflows")
    .update({ node_count: result.node_count })
    .eq("id", workflowId);

  if (parsed.nodes.length > 0) {
    await supabase.from("workflow_nodes").delete().eq("workflow_id", workflowId);
    await supabase.from("workflow_nodes").insert(
      parsed.nodes.map((n) => ({
        workflow_id: workflowId,
        node_key: n.node_key,
        class_type: n.class_type,
        node_type: n.node_type,
        inputs: n.inputs,
        outputs: n.outputs,
        created_by: userId,
        status: statusId,
      }))
    );
  }

  return { analysisId: analysis.id, result };
}
