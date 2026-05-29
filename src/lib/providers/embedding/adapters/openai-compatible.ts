import type { EmbeddingRuntimeConfig } from "@/lib/providers/types";
import { authHeaders, openAiCompatibleBase } from "@/lib/providers/http";

export async function openAiCompatibleEmbedding(
  text: string,
  config: EmbeddingRuntimeConfig,
  maxInputChars: number
): Promise<{ vector: number[]; tokenEstimate: number }> {
  const input = text.slice(0, maxInputChars);
  const base = openAiCompatibleBase(config.baseUrl);
  const body: Record<string, unknown> = {
    model: config.model,
    input,
  };
  if (config.dimensions > 0) {
    body.dimensions = config.dimensions;
  }

  const response = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers: authHeaders(config.apiKey),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Embedding provider error (${response.status}): ${errText.slice(0, 500)}`
    );
  }

  const data = (await response.json()) as {
    data: { embedding: number[] }[];
    usage?: { total_tokens?: number };
  };

  const vector = data.data[0]?.embedding;
  if (!vector?.length) {
    throw new Error("Provider returned no embedding vector");
  }

  return {
    vector,
    tokenEstimate: data.usage?.total_tokens ?? Math.ceil(input.length / 4),
  };
}
