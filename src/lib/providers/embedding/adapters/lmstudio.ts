import type { EmbeddingRuntimeConfig } from "@/lib/providers/types";
import { openAiCompatibleEmbedding } from "@/lib/providers/embedding/adapters/openai-compatible";

export async function lmStudioEmbedding(
  text: string,
  config: EmbeddingRuntimeConfig,
  maxInputChars: number
): Promise<{ vector: number[]; tokenEstimate: number }> {
  const baseUrl = config.baseUrl || "http://localhost:1234/v1";
  return openAiCompatibleEmbedding(
    text,
    { ...config, baseUrl },
    maxInputChars
  );
}
