export type AiProviderKind =
  | "disabled"
  | "openai_compatible"
  | "ollama"
  | "lmstudio"
  | "openai";

export type EmbeddingProviderKind =
  | "disabled"
  | "openai_compatible"
  | "ollama"
  | "lmstudio"
  | "openai";

export type AiRuntimeConfig = {
  kind: AiProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
};

export type EmbeddingRuntimeConfig = {
  kind: EmbeddingProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
  enabled: boolean;
};

/** pgvector column size in foundation schema */
export const STORED_EMBEDDING_DIMENSIONS = 1536;
