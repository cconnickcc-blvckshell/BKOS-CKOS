import { STORED_EMBEDDING_DIMENSIONS } from "@/lib/providers/types";

/** Pad or truncate vectors to match pgvector column (1536). */
export function padEmbeddingForStorage(
  vector: number[],
  target = STORED_EMBEDDING_DIMENSIONS
): number[] {
  if (vector.length === target) return vector;
  if (vector.length > target) return vector.slice(0, target);
  return [...vector, ...new Array(target - vector.length).fill(0)];
}
