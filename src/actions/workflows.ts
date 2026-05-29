"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { writeAudit } from "@/lib/audit";
import { parseComfyWorkflow } from "@/lib/workflows/parser";
import {
  buildEmbeddingText,
  generateEmbedding,
} from "@/lib/embeddings";
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

  const parsedNodes = parseComfyWorkflow(workflowJson);
  const statusId = await getActiveStatusId();

  const { data: workflow, error } = await supabase
    .from("workflows")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      category_id: parsed.data.category_id || null,
      workflow_json: workflowJson,
      node_count: parsedNodes.node_count,
      created_by: user.id,
      status: statusId,
    })
    .select("id, title, description")
    .single();

  if (error) return { error: error.message };

  if (parsedNodes.nodes.length > 0) {
    await supabase.from("workflow_nodes").insert(
      parsedNodes.nodes.map((n) => ({
        workflow_id: workflow.id,
        node_key: n.node_key,
        class_type: n.class_type,
        node_type: n.node_type,
        inputs: n.inputs,
        outputs: n.outputs,
        created_by: user.id,
        status: statusId,
      }))
    );
  }

  const embedText = buildEmbeddingText([
    workflow.title,
    workflow.description,
    JSON.stringify(workflowJson).slice(0, 4000),
  ]);
  const embedding = await generateEmbedding(embedText);
  if (embedding) {
    await supabase.from("embeddings").upsert(
      {
        entity_type: "workflow",
        entity_id: workflow.id,
        chunk_index: 0,
        content_text: embedText,
        embedding,
        created_by: user.id,
        status: statusId,
      },
      { onConflict: "entity_type,entity_id,chunk_index" }
    );
  }

  await writeAudit("create", "workflow", workflow.id, { title: parsed.data.title });
  revalidatePath("/workflows");
  return { id: workflow.id };
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
  const [{ data: workflow }, { data: nodes }] = await Promise.all([
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
  ]);
  if (!workflow) throw new Error("Workflow not found");
  return { workflow, nodes: nodes ?? [] };
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
