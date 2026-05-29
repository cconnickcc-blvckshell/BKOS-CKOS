import { createClient } from "@/lib/supabase/server";
import { buildEmbeddingText } from "@/lib/embeddings";

export type EmbeddableEntityType =
  | "knowledge_record"
  | "workflow"
  | "workflow_analysis"
  | "failure_record"
  | "recipe"
  | "recipe_version"
  | "source_extraction_result";

const SUPPORTED: EmbeddableEntityType[] = [
  "knowledge_record",
  "workflow",
  "workflow_analysis",
  "failure_record",
  "recipe",
  "recipe_version",
  "source_extraction_result",
];

export function isEmbeddableEntityType(t: string): t is EmbeddableEntityType {
  return (SUPPORTED as string[]).includes(t);
}

export async function buildEmbeddableContent(
  entityType: EmbeddableEntityType,
  entityId: string
): Promise<{ text: string; metadata: Record<string, unknown> } | null> {
  const supabase = await createClient();

  switch (entityType) {
    case "knowledge_record": {
      const { data } = await supabase
        .from("knowledge_records")
        .select(
          "title, summary, structured_data, source_id, source_version_id, knowledge_types(code, label), knowledge_domains(code, label)"
        )
        .eq("id", entityId)
        .single();
      if (!data) return null;
      const text = buildEmbeddingText([
        data.title,
        data.summary,
        JSON.stringify(data.structured_data).slice(0, 6000),
      ]);
      const kt = data.knowledge_types as { code: string } | { code: string }[] | null;
      const kd = data.knowledge_domains as { code: string } | { code: string }[] | null;
      return {
        text,
        metadata: {
          title: data.title,
          knowledge_type: Array.isArray(kt) ? kt[0]?.code : kt?.code,
          domain: Array.isArray(kd) ? kd[0]?.code : kd?.code,
          source_id: data.source_id,
          source_version_id: data.source_version_id,
        },
      };
    }
    case "workflow": {
      const { data } = await supabase
        .from("workflows")
        .select("title, description, workflow_json, knowledge_domains(code, label)")
        .eq("id", entityId)
        .single();
      if (!data) return null;
      const text = buildEmbeddingText([
        data.title,
        data.description,
        JSON.stringify(data.workflow_json).slice(0, 6000),
      ]);
      return { text, metadata: { title: data.title } };
    }
    case "workflow_analysis": {
      const { data } = await supabase
        .from("workflow_analysis")
        .select(
          `workflow_id, complexity_score, node_count, analysis_metadata,
           workflow_purposes(code, label), complexity_levels(code, label),
           hardware_tiers(code, label),
           workflows(title, description)`
        )
        .eq("id", entityId)
        .single();
      if (!data) return null;
      const wfRaw = data.workflows as
        | { title: string; description: string | null }
        | { title: string; description: string | null }[]
        | null;
      const wf = Array.isArray(wfRaw) ? wfRaw[0] : wfRaw;
      const purpose = data.workflow_purposes as { label: string } | { label: string }[] | null;
      const purposeLabel = Array.isArray(purpose) ? purpose[0]?.label : purpose?.label;
      const text = buildEmbeddingText([
        wf?.title,
        wf?.description,
        purposeLabel ? `purpose ${purposeLabel}` : null,
        `complexity ${data.complexity_score}`,
        JSON.stringify(data.analysis_metadata).slice(0, 4000),
      ]);
      return {
        text,
        metadata: { workflow_id: data.workflow_id, title: wf?.title },
      };
    }
    case "failure_record": {
      const { data } = await supabase
        .from("failure_records")
        .select(
          "symptom, description, detection_signals, knowledge_domains(code, label), failure_categories(code, label)"
        )
        .eq("id", entityId)
        .single();
      if (!data) return null;
      const text = buildEmbeddingText([
        data.symptom,
        data.description,
        JSON.stringify(data.detection_signals).slice(0, 4000),
      ]);
      const kd = data.knowledge_domains as { code: string } | { code: string }[] | null;
      return {
        text,
        metadata: {
          symptom: data.symptom,
          domain: Array.isArray(kd) ? kd[0]?.code : kd?.code,
        },
      };
    }
    case "recipe": {
      const { data } = await supabase
        .from("recipes")
        .select("title, objective, goal, description, constraints, safety_notes, recipe_categories(code, label)")
        .eq("id", entityId)
        .single();
      if (!data) return null;
      const text = buildEmbeddingText([
        data.title,
        data.objective ?? data.goal,
        data.description,
        JSON.stringify(data.constraints).slice(0, 3000),
        data.safety_notes,
      ]);
      return { text, metadata: { title: data.title } };
    }
    case "recipe_version": {
      const { data } = await supabase
        .from("recipe_versions")
        .select("recipe_id, title, objective, steps_snapshot, parameters_snapshot, version_number")
        .eq("id", entityId)
        .single();
      if (!data) return null;
      const text = buildEmbeddingText([
        data.title,
        data.objective,
        JSON.stringify(data.steps_snapshot).slice(0, 4000),
        JSON.stringify(data.parameters_snapshot).slice(0, 2000),
      ]);
      return {
        text,
        metadata: { recipe_id: data.recipe_id, version_number: data.version_number },
      };
    }
    case "source_extraction_result": {
      const { data } = await supabase
        .from("source_extraction_results")
        .select("title, summary, extracted_markdown, extracted_text, canonical_url, source_version_id")
        .eq("id", entityId)
        .single();
      if (!data) return null;
      const text = buildEmbeddingText([
        data.title,
        data.summary,
        (data.extracted_markdown ?? data.extracted_text)?.slice(0, 8000),
      ]);
      return {
        text,
        metadata: {
          title: data.title,
          canonical_url: data.canonical_url,
          source_version_id: data.source_version_id,
        },
      };
    }
    default:
      return null;
  }
}
