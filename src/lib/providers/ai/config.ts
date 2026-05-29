import type { AiProviderKind, AiRuntimeConfig } from "@/lib/providers/types";

function parseProvider(raw: string | undefined): AiProviderKind {
  const v = (raw ?? "disabled").toLowerCase().trim();
  if (
    v === "disabled" ||
    v === "openai_compatible" ||
    v === "ollama" ||
    v === "lmstudio" ||
    v === "openai"
  ) {
    return v;
  }
  return "disabled";
}

export function getAiRuntimeConfig(): AiRuntimeConfig {
  const kind = parseProvider(process.env.AI_PROVIDER);
  const temperature = Number(process.env.AI_TEMPERATURE ?? "0.2");
  const maxTokens = Number(process.env.AI_MAX_TOKENS ?? "4000");

  return {
    kind,
    baseUrl: (process.env.AI_BASE_URL ?? "").replace(/\/$/, ""),
    apiKey: process.env.AI_API_KEY ?? "",
    model: process.env.AI_MODEL ?? "qwen2.5:14b-instruct",
    temperature: Number.isFinite(temperature) ? temperature : 0.2,
    maxTokens: Number.isFinite(maxTokens) ? maxTokens : 4000,
    enabled: kind !== "disabled",
  };
}

export function getAiProviderStatusMessage(): string {
  const cfg = getAiRuntimeConfig();
  if (!cfg.enabled) {
    return "AI provider disabled. Set AI_PROVIDER and configure a local endpoint (Ollama, LM Studio, or OpenAI-compatible) to enable draft generation.";
  }
  if (!cfg.model) {
    return "AI_MODEL is not set.";
  }
  if (
    (cfg.kind === "openai_compatible" || cfg.kind === "lmstudio" || cfg.kind === "ollama") &&
    !cfg.baseUrl
  ) {
    return "AI_BASE_URL is required for the selected AI provider.";
  }
  return "";
}
