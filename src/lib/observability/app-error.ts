import { ErrorCodes, type ErrorCodeKey } from "@/lib/observability/error-codes";
import { redactMetadata, redactString } from "@/lib/observability/redact";

export type AppErrorPayload = {
  code: ErrorCodeKey;
  userMessage: string;
  technicalDetail?: string;
  retryable: boolean;
  recommendedNextStep?: string;
  metadata?: Record<string, unknown>;
  errorCodeId?: string;
};

export class AppError extends Error {
  readonly code: ErrorCodeKey;
  readonly userMessage: string;
  readonly retryable: boolean;
  readonly recommendedNextStep: string;
  readonly metadata: Record<string, unknown>;
  errorCodeId?: string;

  constructor(payload: AppErrorPayload) {
    super(payload.userMessage);
    this.name = "AppError";
    this.code = payload.code;
    this.userMessage = payload.userMessage;
    this.retryable = payload.retryable;
    this.recommendedNextStep =
      payload.recommendedNextStep ?? "See diagnostics or system events for details.";
    this.metadata = redactMetadata(payload.metadata ?? {});
    if (payload.technicalDetail) {
      this.metadata.technical_detail = redactString(payload.technicalDetail);
    }
    this.errorCodeId = payload.errorCodeId;
  }

  toJSON() {
    return {
      code: this.code,
      userMessage: this.userMessage,
      retryable: this.retryable,
      recommendedNextStep: this.recommendedNextStep,
      metadata: this.metadata,
    };
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

export function mapFetchErrorToCode(error: string, httpStatus: number | null): ErrorCodeKey {
  const lower = error.toLowerCase();
  if (lower.includes("robots")) return ErrorCodes.ROBOTS_BLOCKED;
  if (lower.includes("timeout") || lower.includes("aborted")) return ErrorCodes.FETCH_TIMEOUT;
  if (lower.includes("unsupported content type")) return ErrorCodes.FETCH_UNSUPPORTED_CONTENT_TYPE;
  if (lower.includes("untrusted") || lower.includes("trusted domain")) return ErrorCodes.URL_NOT_TRUSTED;
  if (httpStatus != null && httpStatus >= 400) return ErrorCodes.FETCH_HTTP_ERROR;
  if (lower.includes("network")) return ErrorCodes.FETCH_TIMEOUT;
  return ErrorCodes.FETCH_HTTP_ERROR;
}

export function mapAiErrorToCode(message: string): ErrorCodeKey {
  const lower = message.toLowerCase();
  if (lower.includes("disabled")) return ErrorCodes.AI_PROVIDER_DISABLED;
  if (lower.includes("empty response") || lower.includes("not valid json")) {
    return ErrorCodes.AI_PROVIDER_BAD_RESPONSE;
  }
  if (lower.includes("fetch") || lower.includes("econnrefused") || lower.includes("unreachable")) {
    return ErrorCodes.AI_PROVIDER_UNREACHABLE;
  }
  return ErrorCodes.AI_PROVIDER_UNREACHABLE;
}

export function mapEmbeddingErrorToCode(message: string): ErrorCodeKey {
  const lower = message.toLowerCase();
  if (lower.includes("disabled") || lower.includes("provider_disabled")) {
    return ErrorCodes.EMBEDDING_PROVIDER_DISABLED;
  }
  if (lower.includes("dimension")) return ErrorCodes.EMBEDDING_DIMENSION_MISMATCH;
  return ErrorCodes.EMBEDDING_PROVIDER_UNREACHABLE;
}

export function errorFromUnknown(
  e: unknown,
  fallbackCode: ErrorCodeKey = ErrorCodes.UNKNOWN_ERROR
): AppError {
  if (isAppError(e)) return e;

  if (e && typeof e === "object" && "code" in e && "message" in e) {
    const pg = e as { code?: string; message?: string };
    if (pg.code === "42501" || pg.message?.toLowerCase().includes("row-level security")) {
      return new AppError({
        code: ErrorCodes.SUPABASE_RLS_DENIED,
        userMessage: "Permission denied. Sign in or check row-level security policies.",
        technicalDetail: pg.message,
        retryable: false,
        recommendedNextStep: "Sign in again and retry the action.",
      });
    }
  }

  const technical =
    e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";

  return new AppError({
    code: fallbackCode,
    userMessage: "Something went wrong. See diagnostics for the error code and next steps.",
    technicalDetail: technical,
    retryable: fallbackCode === ErrorCodes.UNKNOWN_ERROR,
    metadata: { raw_type: typeof e },
  });
}
