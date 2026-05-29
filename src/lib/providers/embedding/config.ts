import type { EmbeddingProviderKind, EmbeddingRuntimeConfig } from "@/lib/providers/types";

function parseProvider(raw: string | undefined): EmbeddingProviderKind {
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

export function getEmbeddingRuntimeConfig(): EmbeddingRuntimeConfig {
  const kind = parseProvider(process.env.EMBEDDING_PROVIDER);
  const dimensions = Number(process.env.EMBEDDING_DIMENSIONS ?? "768");

  return {
    kind,
    baseUrl: (process.env.EMBEDDING_BASE_URL ?? "").replace(/\/$/, ""),
    apiKey: process.env.EMBEDDING_API_KEY ?? "",
    model: process.env.EMBEDDING_MODEL ?? "nomic-embed-text",
    dimensions: Number.isFinite(dimensions) ? dimensions : 768,
    enabled: kind !== "disabled",
  };
}

export function getEmbeddingProviderStatusMessage(): string {
  const cfg = getEmbeddingRuntimeConfig();
  if (!cfg.enabled) {
    return "Embedding provider disabled. Full-text search still works; semantic search activates when embeddings exist.";
  }
  if (!cfg.model) {
    return "EMBEDDING_MODEL is not set.";
  }
  if (
    (cfg.kind === "openai_compatible" ||
      cfg.kind === "lmstudio" ||
      cfg.kind === "ollama") &&
    !cfg.baseUrl
  ) {
    return "EMBEDDING_BASE_URL is required for the selected embedding provider.";
  }
  return "";
}
