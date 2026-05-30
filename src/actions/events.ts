"use server";

import { createClient } from "@/lib/supabase/server";

export async function listSystemEvents(options?: {
  severity?: string;
  entityType?: string;
  limit?: number;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("system_events")
    .select(
      `id, severity, message, entity_type, entity_id, created_at, metadata,
       error_codes(id, code, title, retryable),
       system_event_types(id, code, label)`
    )
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 100);

  if (options?.severity) {
    query = query.eq("severity", options.severity);
  }
  if (options?.entityType) {
    query = query.eq("entity_type", options.entityType);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listJobAttempts(jobType: string, jobId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_attempts")
    .select(
      `*,
       error_codes(id, code, title, retryable, recommended_fixes)`
    )
    .eq("job_type", jobType)
    .eq("job_id", jobId)
    .order("attempt_number", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
