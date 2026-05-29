"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { writeAudit } from "@/lib/audit";
import { enqueueEmbeddingJob } from "@/lib/embeddings/queue";
import { z } from "zod";

const recordSchema = z.object({
  title: z.string().min(1),
  knowledge_type_id: z.string().uuid(),
  summary: z.string().optional(),
  source_id: z.string().uuid().optional().or(z.literal("")),
  structured_data: z.string().optional(),
  confidence: z.coerce.number().min(0).max(1).optional(),
});

export async function createKnowledgeRecord(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  let structuredData = {};
  const rawStructured = formData.get("structured_data") as string;
  if (rawStructured) {
    try {
      structuredData = JSON.parse(rawStructured);
    } catch {
      return { error: "Invalid JSON in structured data" };
    }
  }

  const parsed = recordSchema.safeParse({
    title: formData.get("title"),
    knowledge_type_id: formData.get("knowledge_type_id"),
    summary: formData.get("summary") || undefined,
    source_id: formData.get("source_id") || undefined,
    confidence: formData.get("confidence") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.message };

  const statusId = await getActiveStatusId();
  const { data, error } = await supabase
    .from("knowledge_records")
    .insert({
      title: parsed.data.title,
      knowledge_type_id: parsed.data.knowledge_type_id,
      summary: parsed.data.summary ?? null,
      source_id: parsed.data.source_id || null,
      structured_data: structuredData,
      confidence: parsed.data.confidence ?? null,
      created_by: user.id,
      status: statusId,
    })
    .select("id, title, summary")
    .single();

  if (error) return { error: error.message };

  await enqueueEmbeddingJob({
    entityType: "knowledge_record",
    entityId: data.id,
    userId: user.id,
  });
  await writeAudit("create", "knowledge_record", data.id, parsed.data);
  revalidatePath("/knowledge");
  return { id: data.id };
}

export async function listKnowledgeRecords(typeId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("knowledge_records")
    .select(
      `*, knowledge_types(id, code, label),
       entities(id, canonical_slug, display_name)`
    )
    .order("updated_at", { ascending: false });

  if (typeId) query = query.eq("knowledge_type_id", typeId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function getKnowledgeRecord(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_records")
    .select(
      `*, knowledge_types(id, code, label),
       entities(id, canonical_slug, display_name, entity_types(id, code, label)),
       knowledge_domains(id, code, label)`
    )
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listKnowledgeTypes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_types")
    .select("*")
    .order("label");
  if (error) throw new Error(error.message);
  return data;
}

const relationshipSchema = z.object({
  from_record_id: z.string().uuid(),
  to_record_id: z.string().uuid(),
  relationship_type_id: z.string().uuid(),
  evidence: z.string().optional(),
  weight: z.coerce.number().min(0).max(1).optional(),
});

export async function createKnowledgeRelationship(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = relationshipSchema.safeParse({
    from_record_id: formData.get("from_record_id"),
    to_record_id: formData.get("to_record_id"),
    relationship_type_id: formData.get("relationship_type_id"),
    evidence: formData.get("evidence") || undefined,
    weight: formData.get("weight") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.message };

  const statusId = await getActiveStatusId();
  const { data, error } = await supabase
    .from("knowledge_relationships")
    .insert({
      ...parsed.data,
      created_by: user.id,
      status: statusId,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  await writeAudit("create", "knowledge_relationship", data.id, parsed.data);
  revalidatePath("/graph");
  revalidatePath("/knowledge");
  return { id: data.id };
}

export async function listRelationshipTypes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("relationship_types")
    .select("*")
    .order("label");
  if (error) throw new Error(error.message);
  return data;
}

export async function getKnowledgeGraph() {
  const supabase = await createClient();

  const [{ data: records }, { data: relationships }] = await Promise.all([
    supabase
      .from("knowledge_records")
      .select("id, title, knowledge_types(code, label)")
      .limit(500),
    supabase
      .from("knowledge_relationships")
      .select("id, from_record_id, to_record_id, relationship_types(code, label)"),
  ]);

  const nodes =
    records?.map((r) => ({
      id: r.id,
      label: r.title,
      type:
        (r.knowledge_types as { code?: string } | null)?.code ?? "unknown",
    })) ?? [];

  const links =
    relationships?.map((rel) => ({
      source: rel.from_record_id,
      target: rel.to_record_id,
      type:
        (rel.relationship_types as { label?: string } | null)?.label ??
        "related",
    })) ?? [];

  return { nodes, links };
}

export async function getRecordRelationships(recordId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_relationships")
    .select(
      "*, relationship_types(code, label), from_record:knowledge_records!from_record_id(id, title), to_record:knowledge_records!to_record_id(id, title)"
    )
    .or(`from_record_id.eq.${recordId},to_record_id.eq.${recordId}`);
  if (error) throw new Error(error.message);
  return data;
}
