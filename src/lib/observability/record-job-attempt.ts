import { createClient } from "@/lib/supabase/server";
import { redactMetadata, redactString } from "@/lib/observability/redact";
import { getErrorCodeId, type AttemptStatus } from "@/lib/observability/lookup";
import type { ErrorCodeKey } from "@/lib/observability/error-codes";
import type { AppError } from "@/lib/observability/app-error";

export type RecordJobAttemptInput = {
  jobType: string;
  jobId: string;
  status: AttemptStatus;
  startedAt: Date;
  completedAt?: Date;
  errorCode?: ErrorCodeKey;
  error?: AppError;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  userId?: string | null;
};

export async function recordJobAttempt(
  input: RecordJobAttemptInput
): Promise<string | null> {
  try {
    const supabase = await createClient();

    const { count } = await supabase
      .from("job_attempts")
      .select("id", { count: "exact", head: true })
      .eq("job_type", input.jobType)
      .eq("job_id", input.jobId);

    const attemptNumber = (count ?? 0) + 1;
    const completedAt = input.completedAt ?? new Date();
    const durationMs = Math.max(
      0,
      completedAt.getTime() - input.startedAt.getTime()
    );

    let errorCodeId: string | null = null;
    if (input.error?.errorCodeId) errorCodeId = input.error.errorCodeId;
    else if (input.error?.code) errorCodeId = await getErrorCodeId(input.error.code);
    else if (input.errorCode) errorCodeId = await getErrorCodeId(input.errorCode);

    const message = redactString(
      input.error?.userMessage ??
        input.errorMessage ??
        input.error?.message ??
        ""
    );

    const { data, error } = await supabase
      .from("job_attempts")
      .insert({
        job_type: input.jobType,
        job_id: input.jobId,
        attempt_number: attemptNumber,
        status: input.status,
        started_at: input.startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_ms: durationMs,
        error_code_id: errorCodeId,
        error_message: message || null,
        metadata: redactMetadata(input.metadata ?? {}),
        created_by: input.userId ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[recordJobAttempt]", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    console.error("[recordJobAttempt]", e);
    return null;
  }
}
