const EMBEDDING_DIMENSION = 1536;

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model =
    process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: text.slice(0, 8000) }),
  });

  if (!response.ok) {
    console.error("Embedding API error:", await response.text());
    return null;
  }

  const data = (await response.json()) as {
    data: { embedding: number[] }[];
  };
  return data.data[0]?.embedding ?? null;
}

export function buildEmbeddingText(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join("\n\n");
}

export { EMBEDDING_DIMENSION };
