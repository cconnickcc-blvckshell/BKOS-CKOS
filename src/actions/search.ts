"use server";

import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/embeddings";
import {
  enrichEmbeddingHits,
  enrichKnowledgeHybridResults,
} from "@/lib/embeddings/enrich-search";

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
    if (!error && data?.length) {
      return enrichKnowledgeHybridResults(data);
    }
  }

  const { data: textOnly } = await supabase
    .from("knowledge_records")
    .select("id, title, summary, knowledge_type_id")
    .textSearch("search_vector", query, { type: "websearch", config: "english" })
    .limit(30);

  const basic =
    textOnly?.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      knowledge_type_id: r.knowledge_type_id,
      text_rank: 1,
      semantic_similarity: 0,
      combined_score: 1,
    })) ?? [];

  return enrichKnowledgeHybridResults(basic);
}

export async function semanticSearchAll(
  query: string,
  entityTypes?: string[]
) {
  const embedding = await generateEmbedding(query);
  if (!embedding) {
    return { results: [], enriched: [], message: "Set OPENAI_API_KEY for semantic search" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_embeddings_enriched", {
    query_embedding: embedding,
    match_threshold: 0.35,
    match_count: 25,
    filter_entity_types: entityTypes ?? null,
  });

  if (error) {
    const fallback = await supabase.rpc("match_embeddings", {
      query_embedding: embedding,
      match_threshold: 0.35,
      match_count: 25,
      filter_entity_types: entityTypes ?? null,
    });
    if (fallback.error) throw new Error(fallback.error.message);
    const enriched = await enrichEmbeddingHits(
      (fallback.data ?? []).map((r: { id: string; entity_type: string; entity_id: string; content_text: string; similarity: number }) => ({
        id: r.id,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        content_text: r.content_text,
        similarity: r.similarity,
      }))
    );
    return { results: fallback.data ?? [], enriched, message: null };
  }

  const enriched = await enrichEmbeddingHits(
    (data ?? []).map((r: { embedding_id: string; entity_type: string; entity_id: string; content_text: string; similarity: number }) => ({
      embedding_id: r.embedding_id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      content_text: r.content_text,
      similarity: r.similarity,
    }))
  );

  return { results: data ?? [], enriched, message: null };
}
