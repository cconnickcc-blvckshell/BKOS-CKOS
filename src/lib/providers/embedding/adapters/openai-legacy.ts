import type { EmbeddingRuntimeConfig } from "@/lib/providers/types";
import { openAiCompatibleEmbedding } from "@/lib/providers/embedding/adapters/openai-compatible";

export async function openAiLegacyEmbedding(
  text: string,
  config: EmbeddingRuntimeConfig,
  maxInputChars: number
): Promise<{ vector: number[]; tokenEstimate: number }> {
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
  const baseUrl = config.baseUrl || "https://api.openai.com/v1";
  const model =
    config.model ||
    process.env.OPENAI_EMBEDDING_MODEL ||
    "text-embedding-3-small";
  const dimensions =
    config.dimensions > 0 ? config.dimensions : 1536;

  return openAiCompatibleEmbedding(
    text,
    { ...config, apiKey, baseUrl, model, dimensions },
    maxInputChars
  );
}
