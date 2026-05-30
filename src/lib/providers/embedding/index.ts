import {
  getEmbeddingRuntimeConfig,
  getEmbeddingProviderStatusMessage,
} from "@/lib/providers/embedding/config";
import { openAiCompatibleEmbedding } from "@/lib/providers/embedding/adapters/openai-compatible";
import { ollamaEmbedding } from "@/lib/providers/embedding/adapters/ollama";
import { lmStudioEmbedding } from "@/lib/providers/embedding/adapters/lmstudio";
import { openAiLegacyEmbedding } from "@/lib/providers/embedding/adapters/openai-legacy";
import { padEmbeddingForStorage } from "@/lib/providers/embedding/vector-utils";

export {
  getEmbeddingRuntimeConfig,
  getEmbeddingProviderStatusMessage,
  padEmbeddingForStorage,
};

export function isEmbeddingProviderEnabled(): boolean {
  return (
    getEmbeddingRuntimeConfig().enabled && !getEmbeddingProviderStatusMessage()
  );
}

export async function generateEmbeddingVector(
  text: string,
  options?: { maxInputTokens?: number }
): Promise<number[] | null> {
  const config = getEmbeddingRuntimeConfig();
  if (!config.enabled) return null;

  const statusMsg = getEmbeddingProviderStatusMessage();
  if (statusMsg) {
    console.warn("[embeddings]", statusMsg);
    return null;
  }

  const maxChars = (options?.maxInputTokens ?? 8192) * 4;
  let result: { vector: number[]; tokenEstimate: number };

  try {
    switch (config.kind) {
      case "openai_compatible":
        result = await openAiCompatibleEmbedding(text, config, maxChars);
        break;
      case "ollama":
        result = await ollamaEmbedding(text, config, maxChars);
        break;
      case "lmstudio":
        result = await lmStudioEmbedding(text, config, maxChars);
        break;
      case "openai":
        result = await openAiLegacyEmbedding(text, config, maxChars);
        break;
      default:
        return null;
    }
  } catch (e) {
    console.error("[embeddings]", e);
    return null;
  }

  return padEmbeddingForStorage(result.vector);
}

export async function generateEmbeddingWithMeta(
  text: string,
  maxInputTokens = 8192
): Promise<{ vector: number[]; tokenEstimate: number } | null> {
  const config = getEmbeddingRuntimeConfig();
  if (!config.enabled || getEmbeddingProviderStatusMessage()) return null;

  const maxChars = maxInputTokens * 4;
  try {
    let result: { vector: number[]; tokenEstimate: number };
    switch (config.kind) {
      case "openai_compatible":
        result = await openAiCompatibleEmbedding(text, config, maxChars);
        break;
      case "ollama":
        result = await ollamaEmbedding(text, config, maxChars);
        break;
      case "lmstudio":
        result = await lmStudioEmbedding(text, config, maxChars);
        break;
      case "openai":
        result = await openAiLegacyEmbedding(text, config, maxChars);
        break;
      default:
        return null;
    }
    return {
      vector: padEmbeddingForStorage(result.vector),
      tokenEstimate: result.tokenEstimate,
    };
  } catch {
    return null;
  }
}
