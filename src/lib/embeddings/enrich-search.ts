import { createClient } from "@/lib/supabase/server";

function one<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}

export type EnrichedSearchHit = {
  embedding_id: string;
  entity_type: string;
  entity_id: string;
  content_text: string;
  similarity: number;
  match_reason: string;
  title: string;
  subtitle?: string | null;
  href: string;
  domain_label?: string | null;
  domain_code?: string | null;
  entity_type_label?: string | null;
  source_type_label?: string | null;
  source_version_id?: string | null;
  source_version_number?: number | null;
  citation?: string | null;
};

export async function enrichEmbeddingHits(
  hits: {
    embedding_id?: string;
    id?: string;
    entity_type: string;
    entity_id: string;
    content_text: string;
    similarity: number;
  }[]
): Promise<EnrichedSearchHit[]> {
  const supabase = await createClient();
  const enriched: EnrichedSearchHit[] = [];

  for (const hit of hits) {
    const similarity = hit.similarity;
    const match_reason = `Semantic match (${(similarity * 100).toFixed(0)}% similar)`;
    const base = {
      embedding_id: hit.embedding_id ?? hit.id ?? "",
      entity_type: hit.entity_type,
      entity_id: hit.entity_id,
      content_text: hit.content_text,
      similarity,
      match_reason,
    };

    switch (hit.entity_type) {
      case "knowledge_record": {
        const { data } = await supabase
          .from("knowledge_records")
          .select(
            `title, summary, source_id, source_version_id,
             knowledge_types(label, code),
             knowledge_domains(label, code),
             entities(display_name, canonical_slug),
             source_versions(version_number, sources(title, source_types(label)))`
          )
          .eq("id", hit.entity_id)
          .maybeSingle();
        if (!data) {
          enriched.push({
            ...base,
            title: hit.content_text.slice(0, 80),
            href: `/knowledge/${hit.entity_id}`,
          });
          break;
        }
        type SvRow = {
          version_number: number;
          sources: {
            title: string;
            source_types: { label: string } | null;
          };
        };
        const sv = one<SvRow>(data.source_versions);
        const src = one<SvRow["sources"]>(sv?.sources);
        const st = one<{ label: string }>(src?.source_types);
        enriched.push({
          ...base,
          title: data.title,
          subtitle: data.summary,
          href: `/knowledge/${hit.entity_id}`,
          domain_label: one<{ label: string }>(data.knowledge_domains)?.label,
          domain_code: one<{ code: string }>(data.knowledge_domains)?.code,
          entity_type_label: one<{ label: string }>(data.knowledge_types)?.label,
          source_type_label: st?.label ?? null,
          source_version_id: data.source_version_id,
          source_version_number: sv?.version_number ?? null,
          citation: sv
            ? `${src?.title ?? "Source"} v${sv.version_number}`
            : data.source_id
              ? "Linked source"
              : null,
        });
        break;
      }
      case "workflow": {
        const { data } = await supabase
          .from("workflows")
          .select("title, description, workflow_categories(label)")
          .eq("id", hit.entity_id)
          .maybeSingle();
        enriched.push({
          ...base,
          title: data?.title ?? "Workflow",
          subtitle: data?.description,
          href: `/workflows/${hit.entity_id}`,
          entity_type_label:
            one<{ label: string }>(data?.workflow_categories)?.label ?? "Workflow",
          source_type_label: "Workflow",
        });
        break;
      }
      case "workflow_analysis": {
        const { data } = await supabase
          .from("workflow_analysis")
          .select("workflow_id, workflows(title), workflow_purposes(label)")
          .eq("id", hit.entity_id)
          .maybeSingle();
        const wfId = data?.workflow_id ?? hit.entity_id;
        enriched.push({
          ...base,
          title: one<{ title: string }>(data?.workflows)?.title ?? "Workflow analysis",
          subtitle: one<{ label: string }>(data?.workflow_purposes)?.label,
          href: `/workflows/${wfId}`,
          entity_type_label: "Workflow analysis",
          source_type_label: "Analysis",
        });
        break;
      }
      case "failure_record": {
        const { data } = await supabase
          .from("failure_records")
          .select("symptom, description, knowledge_domains(label, code), failure_categories(label)")
          .eq("id", hit.entity_id)
          .maybeSingle();
        enriched.push({
          ...base,
          title: data?.symptom ?? "Failure",
          subtitle: data?.description,
          href: `/failures/${hit.entity_id}`,
          domain_label: one<{ label: string }>(data?.knowledge_domains)?.label,
          entity_type_label: one<{ label: string }>(data?.failure_categories)?.label,
          source_type_label: "Failure intelligence",
        });
        break;
      }
      case "recipe": {
        const { data } = await supabase
          .from("recipes")
          .select("title, objective, recipe_categories(label), knowledge_domains(label, code)")
          .eq("id", hit.entity_id)
          .maybeSingle();
        enriched.push({
          ...base,
          title: data?.title ?? "Recipe",
          subtitle: data?.objective,
          href: `/recipes/${hit.entity_id}`,
          domain_label: one<{ label: string }>(data?.knowledge_domains)?.label,
          entity_type_label: one<{ label: string }>(data?.recipe_categories)?.label,
          source_type_label: "Recipe",
        });
        break;
      }
      case "recipe_version": {
        const { data } = await supabase
          .from("recipe_versions")
          .select("recipe_id, title, version_number")
          .eq("id", hit.entity_id)
          .maybeSingle();
        enriched.push({
          ...base,
          title: data?.title ?? "Recipe version",
          subtitle: data ? `Version ${data.version_number}` : null,
          href: `/recipes/${data?.recipe_id ?? hit.entity_id}`,
          entity_type_label: "Recipe version",
          source_type_label: "Recipe",
          citation: data ? `Recipe v${data.version_number}` : null,
        });
        break;
      }
      case "source_extraction_result": {
        const { data } = await supabase
          .from("source_extraction_results")
          .select(
            "title, canonical_url, source_version_id, source_versions(version_number, sources(title, source_types(label)))"
          )
          .eq("id", hit.entity_id)
          .maybeSingle();
        type ExtSv = {
          version_number: number;
          sources: { id: string; title: string; source_types: { label: string } | null };
        };
        const sv = one<ExtSv>(data?.source_versions);
        const src = one<ExtSv["sources"]>(sv?.sources);
        const st = one<{ label: string }>(src?.source_types);
        enriched.push({
          ...base,
          title: data?.title ?? "Source extraction",
          subtitle: data?.canonical_url,
          href: src?.id ? `/sources/${src.id}` : "/sources",
          source_type_label: st?.label ?? "Source",
          source_version_id: data?.source_version_id,
          source_version_number: sv?.version_number,
          citation: sv
            ? `${src?.title ?? "Source"} v${sv.version_number} (extraction)`
            : null,
          entity_type_label: "Extraction",
        });
        break;
      }
      default:
        enriched.push({
          ...base,
          title: hit.content_text.slice(0, 80),
          href: "#",
        });
    }
  }

  return enriched;
}

export async function enrichKnowledgeHybridResults(
  results: {
    id: string;
    title: string;
    summary: string | null;
    text_rank?: number;
    semantic_similarity?: number;
    combined_score?: number;
  }[]
) {
  const supabase = await createClient();
  const enriched = [];

  for (const r of results) {
    const { data } = await supabase
      .from("knowledge_records")
      .select(
        `source_id, source_version_id,
         knowledge_types(label, code),
         knowledge_domains(label, code),
         entities(display_name),
         source_versions(version_number, sources(title, source_types(label)))`
      )
      .eq("id", r.id)
      .maybeSingle();

    type HybridSv = {
      version_number: number;
      sources: { title: string; source_types: { label: string } | null };
    };
    const sv = one<HybridSv>(data?.source_versions);
    const src = one<HybridSv["sources"]>(sv?.sources);
    const st = one<{ label: string }>(src?.source_types);

    const parts: string[] = [];
    if ((r.semantic_similarity ?? 0) > 0) {
      parts.push(`Semantic ${((r.semantic_similarity ?? 0) * 100).toFixed(0)}%`);
    }
    if ((r.text_rank ?? 0) > 0) {
      parts.push(`Keyword rank ${(r.text_rank ?? 0).toFixed(2)}`);
    }

    enriched.push({
      ...r,
      href: `/knowledge/${r.id}`,
      domain_label: one<{ label: string }>(data?.knowledge_domains)?.label,
      domain_code: one<{ code: string }>(data?.knowledge_domains)?.code,
      entity_type_label: one<{ label: string }>(data?.knowledge_types)?.label,
      source_type_label: st?.label ?? null,
      source_version_id: data?.source_version_id,
      source_version_number: sv?.version_number,
      citation: sv ? `${src?.title ?? "Source"} v${sv.version_number}` : null,
      entity_name: one<{ display_name: string }>(data?.entities)?.display_name,
      match_reason: parts.length ? parts.join(" · ") : "Hybrid match",
    });
  }

  return enriched;
}
