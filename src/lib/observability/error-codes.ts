/** Stable error code identifiers (must match DB seeds). */
export const ErrorCodes = {
  ENV_MISSING_SUPABASE_URL: "ENV_MISSING_SUPABASE_URL",
  ENV_MISSING_SUPABASE_ANON_KEY: "ENV_MISSING_SUPABASE_ANON_KEY",
  ENV_MISSING_SERVICE_ROLE_KEY: "ENV_MISSING_SERVICE_ROLE_KEY",
  AI_PROVIDER_DISABLED: "AI_PROVIDER_DISABLED",
  AI_PROVIDER_UNREACHABLE: "AI_PROVIDER_UNREACHABLE",
  AI_PROVIDER_BAD_RESPONSE: "AI_PROVIDER_BAD_RESPONSE",
  EMBEDDING_PROVIDER_DISABLED: "EMBEDDING_PROVIDER_DISABLED",
  EMBEDDING_PROVIDER_UNREACHABLE: "EMBEDDING_PROVIDER_UNREACHABLE",
  EMBEDDING_DIMENSION_MISMATCH: "EMBEDDING_DIMENSION_MISMATCH",
  URL_NOT_TRUSTED: "URL_NOT_TRUSTED",
  ROBOTS_BLOCKED: "ROBOTS_BLOCKED",
  FETCH_TIMEOUT: "FETCH_TIMEOUT",
  FETCH_HTTP_ERROR: "FETCH_HTTP_ERROR",
  FETCH_UNSUPPORTED_CONTENT_TYPE: "FETCH_UNSUPPORTED_CONTENT_TYPE",
  EXTRACTION_EMPTY_CONTENT: "EXTRACTION_EMPTY_CONTENT",
  NORMALIZATION_SOURCE_MISSING: "NORMALIZATION_SOURCE_MISSING",
  NORMALIZATION_OUTPUT_INVALID: "NORMALIZATION_OUTPUT_INVALID",
  WORKFLOW_JSON_INVALID: "WORKFLOW_JSON_INVALID",
  WORKFLOW_ANALYSIS_FAILED: "WORKFLOW_ANALYSIS_FAILED",
  SUPABASE_RLS_DENIED: "SUPABASE_RLS_DENIED",
  SUPABASE_RPC_FAILED: "SUPABASE_RPC_FAILED",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type ErrorCodeKey = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export type ErrorCodeRow = {
  id: string;
  code: string;
  title: string;
  description: string;
  likely_causes: string[];
  recommended_fixes: string[];
  retryable: boolean;
  user_visible: boolean;
  error_categories?: { code: string; label: string } | null;
};

export const FALLBACK_FIXES: Record<string, { title: string; description: string; retryable: boolean; fixes: string[] }> = {
  [ErrorCodes.UNKNOWN_ERROR]: {
    title: "Unknown error",
    description: "An unexpected error occurred.",
    retryable: true,
    fixes: ["Copy diagnostic summary and check system events."],
  },
  [ErrorCodes.AI_PROVIDER_DISABLED]: {
    title: "AI provider disabled",
    description: "AI draft generation is turned off.",
    retryable: false,
    fixes: ["Configure AI_PROVIDER or use manual normalization."],
  },
  [ErrorCodes.EMBEDDING_PROVIDER_DISABLED]: {
    title: "Embedding provider disabled",
    description: "Semantic embeddings are turned off.",
    retryable: false,
    fixes: ["Configure EMBEDDING_PROVIDER or use full-text search."],
  },
  [ErrorCodes.URL_NOT_TRUSTED]: {
    title: "URL not trusted",
    description: "This hostname is not on the trusted domain list.",
    retryable: false,
    fixes: ["Use a URL from an allowlisted documentation domain."],
  },
};
