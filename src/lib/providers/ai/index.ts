import { getAiRuntimeConfig, getAiProviderStatusMessage } from "@/lib/providers/ai/config";
import { ollamaChatJson } from "@/lib/providers/ai/adapters/ollama";
import { lmStudioChatJson } from "@/lib/providers/ai/adapters/lmstudio";
import { openAiLegacyChatJson } from "@/lib/providers/ai/adapters/openai-legacy";
import { chatCompletionsJson } from "@/lib/providers/ai/adapters/openai-compatible";

export { getAiRuntimeConfig, getAiProviderStatusMessage };

export function isAiProviderEnabled(): boolean {
  return getAiRuntimeConfig().enabled && !getAiProviderStatusMessage();
}

export async function generateAiDraftJson(
  systemPrompt: string,
  userPrompt: string
): Promise<{ raw: string; parsed: unknown }> {
  const config = getAiRuntimeConfig();
  const statusMsg = getAiProviderStatusMessage();

  if (!config.enabled) {
    throw new Error(
      statusMsg || "AI provider is disabled. Configure AI_PROVIDER or use manual normalization."
    );
  }
  if (statusMsg) {
    throw new Error(statusMsg);
  }

  switch (config.kind) {
    case "openai_compatible":
      return chatCompletionsJson(config, systemPrompt, userPrompt);
    case "ollama":
      return ollamaChatJson(config, systemPrompt, userPrompt);
    case "lmstudio":
      return lmStudioChatJson(config, systemPrompt, userPrompt);
    case "openai":
      return openAiLegacyChatJson(config, systemPrompt, userPrompt);
    default:
      throw new Error("AI provider is disabled.");
  }
}
