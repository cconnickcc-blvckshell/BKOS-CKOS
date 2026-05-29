"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { writeAudit } from "@/lib/audit";
import { runSourceFetch } from "@/lib/acquisition/run-fetch";
import { normalizeSourceUrl } from "@/lib/acquisition/normalize-url";
import { assertTrustedUrl } from "@/lib/acquisition/trusted-domains";
import { z } from "zod";

const urlSchema = z.string().min(1).refine((v) => {
  try {
    normalizeSourceUrl(v);
    return true;
  } catch {
    return false;
  }
}, "Valid HTTP(S) URL required");

export async function listAcquisitionStatuses() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acquisition_statuses")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data;
}

export async function listTrustedDomains() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trusted_source_domains")
    .select("*")
    .order("domain");
  if (error) throw new Error(error.message);
  return data;
}

export async function listFetchJobs(limit = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_fetch_jobs")
    .select(
      `*,
      acquisition_statuses(id, code, label),
      sources(id, title, url)`
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getFetchJob(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_fetch_jobs")
    .select(
      `*,
      acquisition_statuses(id, code, label),
      sources(id, title, url)`
    )
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getExtractionForVersion(sourceVersionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_extraction_results")
    .select(
      "*, review_status:acquisition_statuses!source_extraction_results_review_status_id_fkey(id, code, label)"
    )
    .eq("source_version_id", sourceVersionId)
    .maybeSingle();
  if (error) {
    const { data: fallback, error: err2 } = await supabase
      .from("source_extraction_results")
      .select("*")
      .eq("source_version_id", sourceVersionId)
      .maybeSingle();
    if (err2) throw new Error(err2.message);
    return fallback;
  }
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const review = row.review_status as { code: string; label: string } | null;
  return { ...row, acquisition_statuses: review };
}

export async function fetchSourceFromUrl(sourceId: string, url?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: source, error: srcErr } = await supabase
    .from("sources")
    .select("id, url, title")
    .eq("id", sourceId)
    .single();

  if (srcErr || !source) return { error: "Source not found" };

  const targetUrl = url?.trim() || source.url;
  if (!targetUrl) return { error: "No URL provided and source has no URL" };

  const parsed = urlSchema.safeParse(targetUrl);
  if (!parsed.success) return { error: parsed.error.message };

  const result = await runSourceFetch(sourceId, user.id, parsed.data);

  revalidatePath(`/sources/${sourceId}`);
  revalidatePath("/acquisition");
  revalidatePath("/sources");

  if (!result.ok) return { error: result.error, jobId: result.jobId };

  return {
    ok: true,
    jobId: result.jobId,
    sourceVersionId: result.sourceVersionId,
    extractionId: result.extractionId,
  };
}

export async function createSourceAndFetch(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const urlRaw = formData.get("url") as string;
  const sourceTypeId = formData.get("source_type_id") as string;
  const titleInput = (formData.get("title") as string)?.trim();

  const parsed = urlSchema.safeParse(urlRaw);
  if (!parsed.success) return { error: parsed.error.message };
  if (!sourceTypeId) return { error: "Source type required" };

  const normalized = normalizeSourceUrl(parsed.data);

  const { data: trustedRows } = await supabase
    .from("trusted_source_domains")
    .select("id, domain, label, is_active, allow_subdomains")
    .eq("is_active", true);

  try {
    assertTrustedUrl(normalized, trustedRows ?? []);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Untrusted domain" };
  }

  const statusId = await getActiveStatusId();
  let title = titleInput;
  if (!title) {
    try {
      title = new URL(normalized).hostname;
    } catch {
      title = "Fetched source";
    }
  }

  const { data: source, error: createErr } = await supabase
    .from("sources")
    .insert({
      title,
      url: normalized,
      source_type_id: sourceTypeId,
      description: (formData.get("description") as string) || null,
      created_by: user.id,
      status: statusId,
    })
    .select("id")
    .single();

  if (createErr || !source) return { error: createErr?.message ?? "Create failed" };

  await writeAudit("create", "source", source.id, { url: normalized, via: "acquisition" });

  const fetchResult = await runSourceFetch(source.id, user.id, normalized);

  revalidatePath("/sources");
  revalidatePath("/acquisition");
  revalidatePath(`/sources/${source.id}`);

  if (!fetchResult.ok) {
    return {
      error: fetchResult.error,
      sourceId: source.id,
      jobId: fetchResult.jobId,
    };
  }

  return {
    ok: true,
    sourceId: source.id,
    jobId: fetchResult.jobId,
    sourceVersionId: fetchResult.sourceVersionId,
  };
}
