import type { AiRuntimeConfig } from "@/lib/providers/types";
import { chatCompletionsJson } from "@/lib/providers/ai/adapters/openai-compatible";

/** LM Studio exposes an OpenAI-compatible API (default http://localhost:1234/v1). */
export async function lmStudioChatJson(
  config: AiRuntimeConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<{ raw: string; parsed: unknown }> {
  const baseUrl =
    config.baseUrl || "http://localhost:1234/v1";
  return chatCompletionsJson({ ...config, baseUrl }, systemPrompt, userPrompt);
}
