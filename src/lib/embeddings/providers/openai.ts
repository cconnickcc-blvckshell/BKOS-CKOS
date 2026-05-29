export type ModelConfig = {
  provider: string;
  model: string;
  dimensions: number;
  max_input_tokens: number;
};

export async function generateOpenAIEmbedding(
  text: string,
  config: ModelConfig
): Promise<{ vector: number[]; tokenEstimate: number } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const input = text.slice(0, config.max_input_tokens * 4);
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input,
      dimensions: config.dimensions,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI embeddings error: ${errText.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    data: { embedding: number[] }[];
    usage?: { total_tokens?: number };
  };

  const vector = data.data[0]?.embedding;
  if (!vector) return null;

  return {
    vector,
    tokenEstimate: data.usage?.total_tokens ?? Math.ceil(input.length / 4),
  };
}
