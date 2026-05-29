"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { writeAudit } from "@/lib/audit";
import { resolveEntityAlias } from "@/lib/entities/resolver";
import { z } from "zod";

export async function listKnowledgeDomains() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_domains")
    .select("*")
    .order("label");
  if (error) throw new Error(error.message);
  return data;
}

export async function listEntityTypes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entity_types")
    .select("*")
    .order("label");
  if (error) throw new Error(error.message);
  return data;
}

export async function listEntities(domainCode?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("entities")
    .select(
      "*, knowledge_domains(id, code, label), entity_types(id, code, label)"
    )
    .order("display_name");

  if (domainCode) {
    const { data: domain } = await supabase
      .from("knowledge_domains")
      .select("id")
      .eq("code", domainCode)
      .single();
    if (domain) query = query.eq("domain_id", domain.id);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function getEntity(id: string) {
  const supabase = await createClient();
  const [{ data: entity }, { data: aliases }] = await Promise.all([
    supabase
      .from("entities")
      .select(
        "*, knowledge_domains(id, code, label), entity_types(id, code, label)"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("entity_aliases")
      .select("*")
      .eq("entity_id", id)
      .order("alias"),
  ]);
  if (!entity) throw new Error("Entity not found");
  return { entity, aliases: aliases ?? [] };
}

const createEntitySchema = z.object({
  domain_code: z.string().min(1),
  entity_type_code: z.string().min(1),
  canonical_slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, "Slug must be lowercase letters, numbers, underscores"),
  display_name: z.string().min(1),
  description: z.string().optional(),
});

export async function createEntity(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = createEntitySchema.safeParse({
    domain_code: formData.get("domain_code"),
    entity_type_code: formData.get("entity_type_code"),
    canonical_slug: formData.get("canonical_slug"),
    display_name: formData.get("display_name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.message };

  const [{ data: domain }, { data: entityType }] = await Promise.all([
    supabase
      .from("knowledge_domains")
      .select("id")
      .eq("code", parsed.data.domain_code)
      .single(),
    supabase
      .from("entity_types")
      .select("id")
      .eq("code", parsed.data.entity_type_code)
      .single(),
  ]);

  if (!domain || !entityType) return { error: "Invalid domain or entity type" };

  const statusId = await getActiveStatusId();
  const { data, error } = await supabase
    .from("entities")
    .insert({
      domain_id: domain.id,
      entity_type_id: entityType.id,
      canonical_slug: parsed.data.canonical_slug,
      display_name: parsed.data.display_name,
      description: parsed.data.description ?? null,
      created_by: user.id,
      status: statusId,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await supabase.from("entity_aliases").insert({
    entity_id: data.id,
    domain_id: domain.id,
    alias: parsed.data.display_name,
    source: "primary",
    confidence: 1,
    created_by: user.id,
    status: statusId,
  });

  await writeAudit("create", "entity", data.id, parsed.data);
  revalidatePath("/entities");
  return { id: data.id };
}

const aliasSchema = z.object({
  entity_id: z.string().uuid(),
  alias: z.string().min(1),
});

export async function createEntityAlias(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = aliasSchema.safeParse({
    entity_id: formData.get("entity_id"),
    alias: formData.get("alias"),
  });

  if (!parsed.success) return { error: parsed.error.message };

  const { data: entity } = await supabase
    .from("entities")
    .select("domain_id")
    .eq("id", parsed.data.entity_id)
    .single();

  if (!entity) return { error: "Entity not found" };

  const statusId = await getActiveStatusId();
  const { error } = await supabase.from("entity_aliases").insert({
    entity_id: parsed.data.entity_id,
    domain_id: entity.domain_id,
    alias: parsed.data.alias,
    source: "user",
    confidence: 1,
    created_by: user.id,
    status: statusId,
  });

  if (error) return { error: error.message };
  revalidatePath(`/entities/${parsed.data.entity_id}`);
  revalidatePath("/entities");
  return { ok: true };
}

export async function assignEntityToKnowledgeRecord(
  knowledgeRecordId: string,
  entityId: string | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  let domainId: string | null = null;
  if (entityId) {
    const { data: entity } = await supabase
      .from("entities")
      .select("domain_id")
      .eq("id", entityId)
      .single();
    if (!entity) return { error: "Entity not found" };
    domainId = entity.domain_id;
  }

  const { error } = await supabase
    .from("knowledge_records")
    .update({ entity_id: entityId, domain_id: domainId })
    .eq("id", knowledgeRecordId);

  if (error) return { error: error.message };
  await writeAudit("update", "knowledge_record", knowledgeRecordId, {
    entity_id: entityId,
    domain_id: domainId,
  });
  revalidatePath(`/knowledge/${knowledgeRecordId}`);
  revalidatePath("/knowledge");
  return { ok: true };
}

export async function resolveAliasAction(domainCode: string, alias: string) {
  try {
    const result = await resolveEntityAlias(domainCode, alias);
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Resolve failed" };
  }
}
