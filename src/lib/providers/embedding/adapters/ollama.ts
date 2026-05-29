import type { EmbeddingRuntimeConfig } from "@/lib/providers/types";
import { openAiCompatibleEmbedding } from "@/lib/providers/embedding/adapters/openai-compatible";

/** Ollama native /api/embeddings or OpenAI-compatible /v1/embeddings. */
export async function ollamaEmbedding(
  text: string,
  config: EmbeddingRuntimeConfig,
  maxInputChars: number
): Promise<{ vector: number[]; tokenEstimate: number }> {
  if (config.baseUrl.includes("/v1")) {
    return openAiCompatibleEmbedding(text, config, maxInputChars);
  }

  const input = text.slice(0, maxInputChars);
  const base = config.baseUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      prompt: input,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama embeddings error (${response.status}): ${errText.slice(0, 500)}`);
  }

  const data = (await response.json()) as { embedding?: number[] };
  const vector = data.embedding;
  if (!vector?.length) {
    throw new Error("Ollama returned no embedding vector");
  }

  return {
    vector,
    tokenEstimate: Math.ceil(input.length / 4),
  };
}
