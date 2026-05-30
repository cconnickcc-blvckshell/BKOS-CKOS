import type { AiRuntimeConfig } from "@/lib/providers/types";
import { chatCompletionsJson } from "@/lib/providers/ai/adapters/openai-compatible";

/** Optional legacy OpenAI — uses AI_* env or OPENAI_API_KEY with api.openai.com. */
export async function openAiLegacyChatJson(
  config: AiRuntimeConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<{ raw: string; parsed: unknown }> {
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
  const baseUrl = config.baseUrl || "https://api.openai.com/v1";
  const model =
    config.model || process.env.OPENAI_MODEL || "gpt-4o-mini";

  return chatCompletionsJson(
    { ...config, apiKey, baseUrl, model },
    systemPrompt,
    userPrompt
  );
}
