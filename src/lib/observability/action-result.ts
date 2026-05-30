import {
  AppError,
  errorFromUnknown,
  isAppError,
  mapAiErrorToCode,
} from "@/lib/observability/app-error";
import { logSystemEvent } from "@/lib/observability/log-system-event";
import { getErrorCodeRow, getFallbackErrorInfo } from "@/lib/observability/lookup";
import type { ErrorCodeKey } from "@/lib/observability/error-codes";

export type ActionErrorResult = {
  error: string;
  code: ErrorCodeKey;
  retryable: boolean;
  recommendedNextStep: string;
  likelyCauses: string[];
  recommendedFixes: string[];
};

export async function enrichActionError(err: AppError): Promise<ActionErrorResult> {
  const row = await getErrorCodeRow(err.code);
  const fallback = getFallbackErrorInfo(err.code);
  return {
    error: err.userMessage,
    code: err.code,
    retryable: row?.retryable ?? err.retryable,
    recommendedNextStep: err.recommendedNextStep,
    likelyCauses: row?.likely_causes ?? [],
    recommendedFixes:
      row?.recommended_fixes ??
      fallback?.fixes ??
      [err.recommendedNextStep],
  };
}

export async function handleActionError(
  e: unknown,
  context: {
    entityType: string;
    entityId?: string;
    eventTypeCode?: string;
    fallbackCode?: ErrorCodeKey;
    userId?: string | null;
  }
): Promise<ActionErrorResult> {
  const fallback =
    context.fallbackCode ??
    (e instanceof Error ? mapAiErrorToCode(e.message) : undefined);
  const appErr = isAppError(e) ? e : errorFromUnknown(e, fallback);
  if (!appErr.errorCodeId) {
    const { getErrorCodeId } = await import("@/lib/observability/lookup");
    appErr.errorCodeId = (await getErrorCodeId(appErr.code)) ?? undefined;
  }

  await logSystemEvent({
    eventTypeCode: context.eventTypeCode ?? "pipeline_failed",
    severity: appErr.retryable ? "warning" : "failed",
    message: appErr.userMessage,
    entityType: context.entityType,
    entityId: context.entityId,
    error: appErr,
    userId: context.userId,
  });

  return enrichActionError(appErr);
}

export function appErrorResult(err: AppError): ActionErrorResult {
  return {
    error: err.userMessage,
    code: err.code,
    retryable: err.retryable,
    recommendedNextStep: err.recommendedNextStep,
    likelyCauses: [],
    recommendedFixes: [err.recommendedNextStep],
  };
}
