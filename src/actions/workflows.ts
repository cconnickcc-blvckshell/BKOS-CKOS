"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { writeAudit } from "@/lib/audit";
import { parseComfyWorkflow } from "@/lib/workflows/parser";
import { runWorkflowAnalysis } from "@/lib/workflows/persist-analysis";
import { enqueueEmbeddingJob } from "@/lib/embeddings/queue";
import { z } from "zod";

const workflowSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category_id: z.string().uuid().optional().or(z.literal("")),
  workflow_json: z.string().min(2),
});

export async function createWorkflow(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = workflowSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    category_id: formData.get("category_id") || undefined,
    workflow_json: formData.get("workflow_json"),
  });

  if (!parsed.success) return { error: parsed.error.message };

  let workflowJson: Record<string, unknown>;
  try {
    workflowJson = JSON.parse(parsed.data.workflow_json);
  } catch {
    return { error: "Invalid workflow JSON" };
  }

  const parsedWorkflow = parseComfyWorkflow(workflowJson);
  const statusId = await getActiveStatusId();

  const { data: workflow, error } = await supabase
    .from("workflows")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      category_id: parsed.data.category_id || null,
      workflow_json: workflowJson,
      node_count: parsedWorkflow.node_count,
      created_by: user.id,
      status: statusId,
    })
    .select("id, title, description")
    .single();

  if (error) return { error: error.message };

  try {
    const analysis = await runWorkflowAnalysis(workflow.id, workflowJson, user.id);
    await enqueueEmbeddingJob({
      entityType: "workflow",
      entityId: workflow.id,
      userId: user.id,
    });
    if (analysis?.analysisId) {
      await enqueueEmbeddingJob({
        entityType: "workflow_analysis",
        entityId: analysis.analysisId,
        userId: user.id,
      });
    }
  } catch (e) {
    console.error("Workflow analysis failed:", e);
    await enqueueEmbeddingJob({
      entityType: "workflow",
      entityId: workflow.id,
      userId: user.id,
    });
  }

  await writeAudit("create", "workflow", workflow.id, { title: parsed.data.title });
  revalidatePath("/workflows");
  return { id: workflow.id };
}

export async function reanalyzeWorkflow(workflowId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: workflow, error } = await supabase
    .from("workflows")
    .select("id, workflow_json")
    .eq("id", workflowId)
    .single();

  if (error || !workflow) return { error: "Workflow not found" };

  try {
    const analysis = await runWorkflowAnalysis(
      workflowId,
      workflow.workflow_json as Record<string, unknown>,
      user.id
    );
    await enqueueEmbeddingJob({
      entityType: "workflow",
      entityId: workflowId,
      userId: user.id,
    });
    if (analysis?.analysisId) {
      await enqueueEmbeddingJob({
        entityType: "workflow_analysis",
        entityId: analysis.analysisId,
        userId: user.id,
      });
    }
    await writeAudit("reanalyze", "workflow", workflowId, {});
    revalidatePath(`/workflows/${workflowId}`);
    revalidatePath("/workflows");
    return { ok: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Analysis failed",
    };
  }
}

export async function listWorkflows() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflows")
    .select("*, workflow_categories(id, code, label)")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getWorkflow(id: string) {
  const supabase = await createClient();
  const [{ data: workflow }, { data: nodes }, { data: analysis }] =
    await Promise.all([
      supabase
        .from("workflows")
        .select("*, workflow_categories(id, code, label)")
        .eq("id", id)
        .single(),
      supabase
        .from("workflow_nodes")
        .select("*")
        .eq("workflow_id", id)
        .order("node_key"),
      supabase
        .from("workflow_analysis")
        .select(
          `*,
          complexity_levels(id, code, label),
          workflow_purposes(id, code, label),
          hardware_tiers(id, code, label)`
        )
        .eq("workflow_id", id)
        .eq("is_current", true)
        .maybeSingle(),
    ]);

  if (!workflow) throw new Error("Workflow not found");
  return { workflow, nodes: nodes ?? [], analysis: analysis ?? null };
}

export async function listWorkflowCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_categories")
    .select("*")
    .order("label");
  if (error) throw new Error(error.message);
  return data;
}
