import { createClient } from "@/lib/supabase/server";
import { redactMetadata } from "@/lib/observability/redact";
import {
  getErrorCodeId,
  getSystemEventTypeId,
  type EventSeverity,
} from "@/lib/observability/lookup";
import type { ErrorCodeKey } from "@/lib/observability/error-codes";
import type { AppError } from "@/lib/observability/app-error";

export type LogSystemEventInput = {
  eventTypeCode: string;
  severity: EventSeverity;
  message: string;
  entityType: string;
  entityId?: string | null;
  domainId?: string | null;
  errorCode?: ErrorCodeKey;
  error?: AppError;
  metadata?: Record<string, unknown>;
  userId?: string | null;
};

export async function logSystemEvent(input: LogSystemEventInput): Promise<string | null> {
  try {
    const eventTypeId = await getSystemEventTypeId(input.eventTypeCode);
    if (!eventTypeId) return null;

    let errorCodeId: string | null = null;
    if (input.error?.errorCodeId) {
      errorCodeId = input.error.errorCodeId;
    } else if (input.error?.code) {
      errorCodeId = await getErrorCodeId(input.error.code);
    } else if (input.errorCode) {
      errorCodeId = await getErrorCodeId(input.errorCode);
    }

    const metadata = redactMetadata({
      ...(input.metadata ?? {}),
      ...(input.error
        ? {
            error_code: input.error.code,
            retryable: input.error.retryable,
            recommended_next_step: input.error.recommendedNextStep,
            ...input.error.metadata,
          }
        : {}),
    });

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("system_events")
      .insert({
        domain_id: input.domainId ?? null,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        event_type_id: eventTypeId,
        severity: input.severity,
        message: input.message.slice(0, 2000),
        error_code_id: errorCodeId,
        metadata,
        created_by: input.userId ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[logSystemEvent]", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    console.error("[logSystemEvent]", e);
    return null;
  }
}
