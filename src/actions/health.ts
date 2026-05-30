"use server";

import { createClient } from "@/lib/supabase/server";
import { getAiProviderStatusMessage, getAiRuntimeConfig } from "@/lib/providers/ai";
import {
  getEmbeddingProviderStatusMessage,
  getEmbeddingRuntimeConfig,
} from "@/lib/providers/embedding";
import { ErrorCodes } from "@/lib/observability/error-codes";
import { logSystemEvent } from "@/lib/observability/log-system-event";

export type HealthCheckRow = {
  checkCode: string;
  status: "success" | "warning" | "failed" | "skipped";
  message: string;
  metadata: Record<string, unknown>;
};

export async function runSystemHealthChecks(): Promise<{
  checks: HealthCheckRow[];
  latestErrors: Awaited<ReturnType<typeof listRecentSystemErrors>>;
}> {
  const checks: HealthCheckRow[] = [];
  const supabase = await createClient();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    checks.push({
      checkCode: "supabase_url",
      status: "failed",
      message: "NEXT_PUBLIC_SUPABASE_URL is not set",
      metadata: { error_code: ErrorCodes.ENV_MISSING_SUPABASE_URL },
    });
  } else {
    checks.push({
      checkCode: "supabase_url",
      status: "success",
      message: "Supabase URL configured",
      metadata: { host: url.replace(/\/\/.*@/, "//[redacted]@") },
    });
  }

  if (!anon) {
    checks.push({
      checkCode: "supabase_anon_key",
      status: "failed",
      message: "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set",
      metadata: { error_code: ErrorCodes.ENV_MISSING_SUPABASE_ANON_KEY },
    });
  } else {
    checks.push({
      checkCode: "supabase_anon_key",
      status: "success",
      message: "Anon key configured",
      metadata: {},
    });
  }

  checks.push({
    checkCode: "supabase_service_role",
    status: service ? "success" : "warning",
    message: service
      ? "Service role key configured"
      : "SUPABASE_SERVICE_ROLE_KEY not set (optional for most UI flows)",
    metadata: service
      ? {}
      : { error_code: ErrorCodes.ENV_MISSING_SERVICE_ROLE_KEY },
  });

  try {
    const { error } = await supabase.from("status_types").select("id").limit(1);
    checks.push({
      checkCode: "supabase_connectivity",
      status: error ? "failed" : "success",
      message: error
        ? `Database query failed: ${error.message}`
        : "Supabase connectivity OK",
      metadata: error ? { error_code: ErrorCodes.SUPABASE_RPC_FAILED } : {},
    });
  } catch (e) {
    checks.push({
      checkCode: "supabase_connectivity",
      status: "failed",
      message: e instanceof Error ? e.message : "Connection failed",
      metadata: {},
    });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  checks.push({
    checkCode: "auth_session",
    status: user ? "success" : "warning",
    message: user ? `Signed in as ${user.email ?? user.id}` : "No active session",
    metadata: user ? { user_id: user.id } : {},
  });

  const aiCfg = getAiRuntimeConfig();
  const aiMsg = getAiProviderStatusMessage();
  checks.push({
    checkCode: "ai_provider",
    status: !aiCfg.enabled
      ? "skipped"
      : aiMsg
        ? "warning"
        : "success",
    message: !aiCfg.enabled
      ? "AI provider disabled (manual normalization OK)"
      : aiMsg || `AI provider: ${aiCfg.kind} / ${aiCfg.model}`,
    metadata: {
      provider: aiCfg.kind,
      model: aiCfg.model,
      base_url: aiCfg.baseUrl || null,
      error_code: !aiCfg.enabled ? ErrorCodes.AI_PROVIDER_DISABLED : undefined,
    },
  });

  const embCfg = getEmbeddingRuntimeConfig();
  const embMsg = getEmbeddingProviderStatusMessage();
  checks.push({
    checkCode: "embedding_provider",
    status: !embCfg.enabled
      ? "skipped"
      : embMsg
        ? "warning"
        : "success",
    message: !embCfg.enabled
      ? "Embedding provider disabled (full-text search OK)"
      : embMsg || `Embedding provider: ${embCfg.kind} / ${embCfg.model}`,
    metadata: {
      provider: embCfg.kind,
      model: embCfg.model,
      dimensions: embCfg.dimensions,
      error_code: !embCfg.enabled
        ? ErrorCodes.EMBEDDING_PROVIDER_DISABLED
        : undefined,
    },
  });

  const { count: trustedCount } = await supabase
    .from("trusted_source_domains")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  checks.push({
    checkCode: "trusted_domains",
    status: (trustedCount ?? 0) > 0 ? "success" : "failed",
    message: `${trustedCount ?? 0} active trusted domains`,
    metadata: { count: trustedCount ?? 0 },
  });

  const failedJobs = await countFailedPipelineJobs(supabase);
  checks.push({
    checkCode: "pending_failed_jobs",
    status: failedJobs.total > 0 ? "warning" : "success",
    message:
      failedJobs.total > 0
        ? `${failedJobs.total} failed/skipped pipeline jobs need attention`
        : "No recent failed fetch or embedding jobs",
    metadata: failedJobs,
  });

  const {
    data: { user: actor },
  } = await supabase.auth.getUser();

  for (const check of checks) {
    await supabase.from("system_health_checks").insert({
      check_code: check.checkCode,
      status: check.status,
      message: check.message,
      metadata: check.metadata,
      created_by: actor?.id ?? null,
    });
  }

  if (actor) {
    await logSystemEvent({
      eventTypeCode: "health_check",
      severity: checks.some((c) => c.status === "failed") ? "warning" : "success",
      message: "System health check completed",
      entityType: "system",
      entityId: null,
      metadata: { check_count: checks.length },
      userId: actor.id,
    });
  }

  const latestErrors = await listRecentSystemErrors(15);
  return { checks, latestErrors };
}

async function countFailedPipelineJobs(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const [fetchFailed, embedFailed] = await Promise.all([
    supabase
      .from("source_fetch_jobs")
      .select("id", { count: "exact", head: true })
      .not("error_message", "is", null),
    supabase
      .from("embedding_jobs")
      .select("id", { count: "exact", head: true })
      .not("error_message", "is", null),
  ]);
  return {
    source_fetch: fetchFailed.count ?? 0,
    embedding: embedFailed.count ?? 0,
    total: (fetchFailed.count ?? 0) + (embedFailed.count ?? 0),
  };
}

export async function listRecentSystemErrors(limit = 20) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("system_events")
    .select(
      `id, severity, message, entity_type, entity_id, created_at, metadata,
       error_codes(id, code, title, retryable),
       system_event_types(code, label)`
    )
    .in("severity", ["failed", "warning"])
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
