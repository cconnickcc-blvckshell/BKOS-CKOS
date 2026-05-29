"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateAiNormalizationDrafts } from "@/lib/normalization/ai/generate-drafts";

export async function generateAiDraftsForJob(jobId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  if (!process.env.OPENAI_API_KEY) {
    return {
      error:
        "OPENAI_API_KEY is not configured. Add it to your environment to use AI draft generation.",
    };
  }

  try {
    const result = await generateAiNormalizationDrafts(jobId, user.id);
    revalidatePath(`/normalization/${jobId}`);
    revalidatePath("/normalization");
    return {
      ok: true,
      runId: result.runId,
      count: result.count,
      outputIds: result.outputIds,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI draft generation failed" };
  }
}

export async function listAiRunsForJob(jobId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("normalization_ai_runs")
    .select(
      `*,
      normalization_statuses(id, code, label),
      prompt_templates(id, code, label),
      ai_provider_configs(id, provider, model)`
    )
    .eq("normalization_job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
