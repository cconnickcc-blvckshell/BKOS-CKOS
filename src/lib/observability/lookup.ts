import { createClient } from "@/lib/supabase/server";
import { FALLBACK_FIXES, type ErrorCodeRow } from "@/lib/observability/error-codes";
import type { ErrorCodeKey } from "@/lib/observability/error-codes";

const codeCache = new Map<string, ErrorCodeRow>();
const eventTypeCache = new Map<string, string>();

export async function getErrorCodeRow(code: ErrorCodeKey): Promise<ErrorCodeRow | null> {
  const cached = codeCache.get(code);
  if (cached) return cached;

  const supabase = await createClient();
  const { data } = await supabase
    .from("error_codes")
    .select(
      `id, code, title, description, likely_causes, recommended_fixes, retryable, user_visible,
       error_categories(code, label)`
    )
    .eq("code", code)
    .maybeSingle();

  if (!data) return null;
  const cat = data.error_categories;
  const category =
    cat == null
      ? null
      : Array.isArray(cat)
        ? (cat[0] as { code: string; label: string } | undefined) ?? null
        : (cat as { code: string; label: string });
  const row: ErrorCodeRow = {
    id: data.id,
    code: data.code,
    title: data.title,
    description: data.description,
    likely_causes: (data.likely_causes as string[]) ?? [],
    recommended_fixes: (data.recommended_fixes as string[]) ?? [],
    retryable: data.retryable,
    user_visible: data.user_visible,
    error_categories: category,
  };
  codeCache.set(code, row);
  return row;
}

export async function getErrorCodeId(code: ErrorCodeKey): Promise<string | null> {
  const row = await getErrorCodeRow(code);
  return row?.id ?? null;
}

export function getFallbackErrorInfo(code: ErrorCodeKey) {
  return FALLBACK_FIXES[code];
}

export async function getSystemEventTypeId(code: string): Promise<string | null> {
  const cached = eventTypeCache.get(code);
  if (cached) return cached;

  const supabase = await createClient();
  const { data } = await supabase
    .from("system_event_types")
    .select("id")
    .eq("code", code)
    .maybeSingle();

  if (!data?.id) return null;
  eventTypeCache.set(code, data.id);
  return data.id;
}

export type EventSeverity = "success" | "info" | "warning" | "failed";
export type AttemptStatus = "success" | "warning" | "failed" | "skipped" | "retryable";
