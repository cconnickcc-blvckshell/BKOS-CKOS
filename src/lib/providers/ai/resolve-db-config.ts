import { createClient } from "@/lib/supabase/server";
import { getAiRuntimeConfig } from "@/lib/providers/ai/config";
import type { AiProviderConfig } from "@/lib/normalization/ai/types";

function dbProviderKey(kind: string): string {
  if (kind === "openai_compatible") return "openai_compatible";
  if (kind === "openai") return "openai";
  return kind;
}

export async function resolveAiProviderForJob(): Promise<AiProviderConfig & { id: string }> {
  const runtime = getAiRuntimeConfig();
  if (!runtime.enabled) {
    throw new Error(
      "AI provider disabled. Configure AI_PROVIDER or use manual normalization."
    );
  }

  const supabase = await createClient();
  const key = dbProviderKey(runtime.kind);

  const { data: row } = await supabase
    .from("ai_provider_configs")
    .select("id, provider, model, max_tokens, temperature")
    .eq("provider", key)
    .order("is_active", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) {
    throw new Error(
      `No ai_provider_configs row for provider "${key}". Apply latest migrations.`
    );
  }

  return {
    id: row.id,
    provider: row.provider,
    model: runtime.model,
    max_tokens: runtime.maxTokens,
    temperature: runtime.temperature,
  };
}
