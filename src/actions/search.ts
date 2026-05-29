"use server";

import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/embeddings";

export async function searchKnowledge(query: string, semantic = true) {
  if (!query.trim()) return [];

  const supabase = await createClient();
  let queryEmbedding: number[] | null = null;

  if (semantic) {
    queryEmbedding = await generateEmbedding(query);
  }

  if (queryEmbedding) {
    const { data, error } = await supabase.rpc("hybrid_search_knowledge", {
      search_query: query,
      query_embedding: queryEmbedding,
      match_count: 30,
      semantic_weight: 0.5,
    });
    if (!error && data?.length) return data;
  }

  const { data: textOnly } = await supabase
    .from("knowledge_records")
    .select("id, title, summary, knowledge_type_id")
    .textSearch("search_vector", query, { type: "websearch", config: "english" })
    .limit(30);

  return (
    textOnly?.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      knowledge_type_id: r.knowledge_type_id,
      text_rank: 1,
      semantic_similarity: 0,
      combined_score: 1,
    })) ?? []
  );
}

export async function semanticSearchAll(
  query: string,
  entityTypes?: string[]
) {
  const embedding = await generateEmbedding(query);
  if (!embedding) {
    return { results: [], message: "Set OPENAI_API_KEY for semantic search" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_embeddings", {
    query_embedding: embedding,
    match_threshold: 0.35,
    match_count: 25,
    filter_entity_types: entityTypes ?? null,
  });

  if (error) throw new Error(error.message);
  return { results: data ?? [], message: null };
}
