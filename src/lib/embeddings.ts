import { generateEmbeddingVector } from "@/lib/providers/embedding";
import { STORED_EMBEDDING_DIMENSIONS } from "@/lib/providers/types";

export async function generateEmbedding(text: string): Promise<number[] | null> {
  return generateEmbeddingVector(text);
}

export function buildEmbeddingText(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join("\n\n");
}

export { STORED_EMBEDDING_DIMENSIONS as EMBEDDING_DIMENSION };
