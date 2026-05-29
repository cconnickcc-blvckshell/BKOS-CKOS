"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const sourceSchema = z.object({
  title: z.string().min(1),
  source_type_id: z.string().uuid(),
  url: z.string().url().optional().or(z.literal("")),
  description: z.string().optional(),
  confidence: z.coerce.number().min(0).max(1).optional(),
});

export async function createSource(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = sourceSchema.safeParse({
    title: formData.get("title"),
    source_type_id: formData.get("source_type_id"),
    url: formData.get("url") || undefined,
    description: formData.get("description") || undefined,
    confidence: formData.get("confidence") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.message };

  const statusId = await getActiveStatusId();
  const { data, error } = await supabase
    .from("sources")
    .insert({
      ...parsed.data,
      url: parsed.data.url || null,
      created_by: user.id,
      status: statusId,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  await writeAudit("create", "source", data.id, parsed.data);
  revalidatePath("/sources");
  return { id: data.id };
}

export async function createSourceVersion(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const sourceId = formData.get("source_id") as string;
  const content = formData.get("content") as string;

  const { data: latest } = await supabase
    .from("source_versions")
    .select("version_number")
    .eq("source_id", sourceId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const versionNumber = (latest?.version_number ?? 0) + 1;
  const statusId = await getActiveStatusId();

  const { data, error } = await supabase
    .from("source_versions")
    .insert({
      source_id: sourceId,
      version_number: versionNumber,
      content,
      created_by: user.id,
      status: statusId,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath(`/sources/${sourceId}`);
  return { id: data.id };
}

export async function listSources() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sources")
    .select("*, source_types(id, code, label)")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getSource(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sources")
    .select("*, source_types(id, code, label)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listSourceTypes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_types")
    .select("*")
    .order("label");
  if (error) throw new Error(error.message);
  return data;
}
