import type { AiRuntimeConfig } from "@/lib/providers/types";
import { authHeaders, openAiCompatibleBase } from "@/lib/providers/http";

export async function chatCompletionsJson(
  config: AiRuntimeConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<{ raw: string; parsed: unknown }> {
  const base = openAiCompatibleBase(config.baseUrl);
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: authHeaders(config.apiKey),
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI provider error (${response.status}): ${err.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) throw new Error("Empty response from AI provider");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI response was not valid JSON");
  }

  return { raw, parsed };
}
