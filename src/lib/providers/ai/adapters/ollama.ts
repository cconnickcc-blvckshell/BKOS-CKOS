import type { AiRuntimeConfig } from "@/lib/providers/types";
import { chatCompletionsJson } from "@/lib/providers/ai/adapters/openai-compatible";

/** Ollama via native /api/chat or OpenAI-compatible /v1 when base URL includes /v1. */
export async function ollamaChatJson(
  config: AiRuntimeConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<{ raw: string; parsed: unknown }> {
  if (config.baseUrl.includes("/v1")) {
    return chatCompletionsJson(config, systemPrompt, userPrompt);
  }

  const base = config.baseUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      format: "json",
      options: {
        temperature: config.temperature,
        num_predict: config.maxTokens,
      },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama error (${response.status}): ${err.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    message?: { content?: string };
  };

  const raw = data.message?.content?.trim() ?? "";
  if (!raw) throw new Error("Empty response from Ollama");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Ollama response was not valid JSON");
  }

  return { raw, parsed };
}
