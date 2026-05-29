"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { writeAudit } from "@/lib/audit";
import { loadResolvedRecipe } from "@/lib/recipes/load-resolved";
import { z } from "zod";

export async function listRecipeCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipe_categories")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data;
}

export async function listRecipeVariantTypes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipe_variant_types")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data;
}

export async function listRecipes(domainCode?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("recipes")
    .select(
      `*, recipe_categories(id, code, label),
       recipe_variant_types(id, code, label),
       knowledge_domains(id, code, label),
       parent:recipes!recipes_parent_recipe_id_fkey(id, title, recipe_slug)`
    )
    .order("updated_at", { ascending: false });

  if (domainCode) {
    const { data: domain } = await supabase
      .from("knowledge_domains")
      .select("id")
      .eq("code", domainCode)
      .single();
    if (domain) query = query.eq("domain_id", domain.id);
  }

  const { data, error } = await query;
  if (error) {
    const { data: fallback, error: err2 } = await supabase
      .from("recipes")
      .select(
        `*, recipe_categories(id, code, label),
         recipe_variant_types(id, code, label),
         knowledge_domains(id, code, label)`
      )
      .order("updated_at", { ascending: false });
    if (err2) throw new Error(err2.message);
    return fallback ?? [];
  }
  return data ?? [];
}

export async function listParentRecipeOptions(domainId: string, excludeId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("recipes")
    .select("id, title, recipe_slug, domain_id")
    .eq("domain_id", domainId)
    .order("title");
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function listAllRecipesForParentSelect() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select("id, title, recipe_slug, domain_id")
    .order("title");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export { loadResolvedRecipe };

const recipeSchema = z.object({
  domain_code: z.string().min(1),
  title: z.string().min(1),
  recipe_slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, "Slug: lowercase, numbers, underscores"),
  objective: z.string().optional(),
  description: z.string().optional(),
  category_code: z.string().min(1),
  variant_type_code: z.string().min(1),
  parent_recipe_id: z.string().uuid().optional().or(z.literal("")),
  entity_id: z.string().uuid().optional().or(z.literal("")),
  constraints: z.string().optional(),
  default_parameters: z.string().optional(),
  quality_checks: z.string().optional(),
  safety_notes: z.string().optional(),
});

async function parseJsonField(raw: string | null | undefined, field: string) {
  if (!raw?.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${field}`);
  }
}

async function resolveRecipeLookups(
  domainCode: string,
  categoryCode: string,
  variantCode: string
) {
  const supabase = await createClient();
  const [{ data: domain }, { data: category }, { data: variant }] =
    await Promise.all([
      supabase.from("knowledge_domains").select("id").eq("code", domainCode).single(),
      supabase.from("recipe_categories").select("id").eq("code", categoryCode).single(),
      supabase.from("recipe_variant_types").select("id").eq("code", variantCode).single(),
    ]);
  if (!domain || !category || !variant) throw new Error("Invalid lookup codes");
  return { domainId: domain.id, categoryId: category.id, variantId: variant.id };
}

async function snapshotRecipeVersion(recipeId: string, userId: string, changeNotes: string) {
  const supabase = await createClient();
  const { data: recipe } = await supabase.from("recipes").select("*").eq("id", recipeId).single();
  if (!recipe) return;

  const { data: steps } = await supabase
    .from("recipe_steps")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("step_number");

  const { data: latest } = await supabase
    .from("recipe_versions")
    .select("version_number")
    .eq("recipe_id", recipeId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const versionNumber = (latest?.version_number ?? 0) + 1;
  const statusId = await getActiveStatusId();

  await supabase.from("recipe_versions").insert({
    recipe_id: recipeId,
    version_number: versionNumber,
    title: recipe.title,
    objective: recipe.objective ?? recipe.goal,
    steps_snapshot: steps ?? [],
    parameters_snapshot: recipe.default_parameters ?? {},
    quality_checks_snapshot: recipe.quality_checks ?? {},
    change_notes: changeNotes,
    created_by: userId,
    status: statusId,
  });
}

export async function createRecipe(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = recipeSchema.safeParse({
    domain_code: formData.get("domain_code"),
    title: formData.get("title"),
    recipe_slug: formData.get("recipe_slug"),
    objective: formData.get("objective") || undefined,
    description: formData.get("description") || undefined,
    category_code: formData.get("category_code"),
    variant_type_code: formData.get("variant_type_code"),
    parent_recipe_id: formData.get("parent_recipe_id") || undefined,
    entity_id: formData.get("entity_id") || undefined,
    constraints: formData.get("constraints") || undefined,
    default_parameters: formData.get("default_parameters") || undefined,
    quality_checks: formData.get("quality_checks") || undefined,
    safety_notes: formData.get("safety_notes") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.message };

  try {
    const { domainId, categoryId, variantId } = await resolveRecipeLookups(
      parsed.data.domain_code,
      parsed.data.category_code,
      parsed.data.variant_type_code
    );

    const constraints = await parseJsonField(parsed.data.constraints, "constraints");
    const default_parameters = await parseJsonField(
      parsed.data.default_parameters,
      "default_parameters"
    );
    const quality_checks = await parseJsonField(
      parsed.data.quality_checks,
      "quality_checks"
    );

    const statusId = await getActiveStatusId();
    const { data, error } = await supabase
      .from("recipes")
      .insert({
        domain_id: domainId,
        title: parsed.data.title,
        recipe_slug: parsed.data.recipe_slug,
        objective: parsed.data.objective ?? null,
        goal: parsed.data.objective ?? null,
        description: parsed.data.description ?? null,
        category_id: categoryId,
        variant_type_id: variantId,
        parent_recipe_id: parsed.data.parent_recipe_id || null,
        entity_id: parsed.data.entity_id || null,
        constraints,
        default_parameters,
        quality_checks,
        safety_notes: parsed.data.safety_notes ?? null,
        created_by: user.id,
        status: statusId,
      })
      .select("id")
      .single();

    if (error) return { error: error.message };

    await snapshotRecipeVersion(data.id, user.id, "Initial version");
    await writeAudit("create", "recipe", data.id, { title: parsed.data.title });
    revalidatePath("/recipes");
    return { id: data.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Create failed" };
  }
}

export async function updateRecipe(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = recipeSchema.safeParse({
    domain_code: formData.get("domain_code"),
    title: formData.get("title"),
    recipe_slug: formData.get("recipe_slug"),
    objective: formData.get("objective") || undefined,
    description: formData.get("description") || undefined,
    category_code: formData.get("category_code"),
    variant_type_code: formData.get("variant_type_code"),
    parent_recipe_id: formData.get("parent_recipe_id") || undefined,
    entity_id: formData.get("entity_id") || undefined,
    constraints: formData.get("constraints") || undefined,
    default_parameters: formData.get("default_parameters") || undefined,
    quality_checks: formData.get("quality_checks") || undefined,
    safety_notes: formData.get("safety_notes") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.message };

  try {
    const { domainId, categoryId, variantId } = await resolveRecipeLookups(
      parsed.data.domain_code,
      parsed.data.category_code,
      parsed.data.variant_type_code
    );

    const constraints = await parseJsonField(parsed.data.constraints, "constraints");
    const default_parameters = await parseJsonField(
      parsed.data.default_parameters,
      "default_parameters"
    );
    const quality_checks = await parseJsonField(
      parsed.data.quality_checks,
      "quality_checks"
    );

    const { error } = await supabase
      .from("recipes")
      .update({
        domain_id: domainId,
        title: parsed.data.title,
        recipe_slug: parsed.data.recipe_slug,
        objective: parsed.data.objective ?? null,
        goal: parsed.data.objective ?? null,
        description: parsed.data.description ?? null,
        category_id: categoryId,
        variant_type_id: variantId,
        parent_recipe_id: parsed.data.parent_recipe_id || null,
        entity_id: parsed.data.entity_id || null,
        constraints,
        default_parameters,
        quality_checks,
        safety_notes: parsed.data.safety_notes ?? null,
      })
      .eq("id", id);

    if (error) return { error: error.message };

    await snapshotRecipeVersion(id, user.id, "Recipe updated");
    await writeAudit("update", "recipe", id, parsed.data);
    revalidatePath(`/recipes/${id}`);
    revalidatePath("/recipes");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
}

export async function createRecipeStep(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const recipeId = formData.get("recipe_id") as string;
  const statusId = await getActiveStatusId();

  const { error } = await supabase.from("recipe_steps").insert({
    recipe_id: recipeId,
    step_number: Number(formData.get("step_number")),
    title: formData.get("title") as string,
    instruction: formData.get("instruction") as string,
    required: formData.get("required") === "on",
    estimated_cost_level: (formData.get("estimated_cost_level") as string) || null,
    created_by: user.id,
    status: statusId,
  });

  if (error) return { error: error.message };
  await snapshotRecipeVersion(recipeId, user.id, "Step added");
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true };
}

export async function deleteRecipeStep(id: string, recipeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("recipe_steps").delete().eq("id", id);
  if (error) return { error: error.message };
  if (user) await snapshotRecipeVersion(recipeId, user.id, "Step removed");
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true };
}

export async function linkRecipeWorkflow(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const recipeId = formData.get("recipe_id") as string;
  const statusId = await getActiveStatusId();

  const { error } = await supabase.from("recipe_workflow_links").insert({
    recipe_id: recipeId,
    workflow_id: formData.get("workflow_id") as string,
    is_primary: formData.get("is_primary") === "on",
    notes: (formData.get("notes") as string) || null,
    created_by: user.id,
    status: statusId,
  });

  if (error) return { error: error.message };
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true };
}

export async function unlinkRecipeWorkflow(linkId: string, recipeId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("recipe_workflow_links").delete().eq("id", linkId);
  if (error) return { error: error.message };
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true };
}

export async function linkRecipeKnowledge(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const recipeId = formData.get("recipe_id") as string;
  const statusId = await getActiveStatusId();

  const { error } = await supabase.from("recipe_knowledge_links").insert({
    recipe_id: recipeId,
    knowledge_record_id: formData.get("knowledge_record_id") as string,
    relationship_notes: (formData.get("relationship_notes") as string) || null,
    created_by: user.id,
    status: statusId,
  });

  if (error) return { error: error.message };
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true };
}

export async function unlinkRecipeKnowledge(linkId: string, recipeId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("recipe_knowledge_links").delete().eq("id", linkId);
  if (error) return { error: error.message };
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true };
}

export async function linkRecipeFailure(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const recipeId = formData.get("recipe_id") as string;
  const statusId = await getActiveStatusId();

  const { error } = await supabase.from("recipe_failure_links").insert({
    recipe_id: recipeId,
    failure_id: formData.get("failure_id") as string,
    mitigation_notes: (formData.get("mitigation_notes") as string) || null,
    created_by: user.id,
    status: statusId,
  });

  if (error) return { error: error.message };
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true };
}

export async function unlinkRecipeFailure(linkId: string, recipeId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("recipe_failure_links").delete().eq("id", linkId);
  if (error) return { error: error.message };
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true };
}

export async function listWorkflowsForRecipeLink() {
  const supabase = await createClient();
  const { data } = await supabase.from("workflows").select("id, title").order("title").limit(200);
  return data ?? [];
}

export async function listKnowledgeForRecipeLink() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("knowledge_records")
    .select("id, title")
    .order("title")
    .limit(200);
  return data ?? [];
}

export async function listFailuresForRecipeLink() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("failure_records")
    .select("id, symptom")
    .order("symptom")
    .limit(200);
  return data ?? [];
}
