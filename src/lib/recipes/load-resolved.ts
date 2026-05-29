import { createClient } from "@/lib/supabase/server";
import {
  buildAncestryChain,
  resolveRecipeInheritance,
  type RecipeRow,
  type RecipeStepRow,
  type ResolvedRecipe,
} from "@/lib/recipes/inheritance";

export async function loadResolvedRecipe(
  recipeId: string
): Promise<{
  recipe: RecipeRow;
  resolved: ResolvedRecipe;
  localSteps: {
    id: string;
    step_number: number;
    title: string;
    instruction: string;
    required: boolean;
    estimated_cost_level: string | null;
  }[];
  versions: unknown[];
  links: {
    knowledge: unknown[];
    workflows: unknown[];
    failures: unknown[];
    dependencies: unknown[];
  };
}> {
  const supabase = await createClient();

  const { data: recipe, error } = await supabase
    .from("recipes")
    .select(
      `*, recipe_categories(id, code, label),
       recipe_variant_types(id, code, label),
       knowledge_domains(id, code, label),
       entities(id, canonical_slug, display_name),
       parent:recipes!parent_recipe_id(id, title, recipe_slug)`
    )
    .eq("id", recipeId)
    .single();

  if (error || !recipe) throw new Error("Recipe not found");

  const recipesById = new Map<string, RecipeRow>();
  let currentId: string | null = recipeId;

  while (currentId) {
    const { data: row } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", currentId)
      .single();
    if (!row) break;
    const r = row as RecipeRow;
    recipesById.set(r.id, {
      ...r,
      constraints: (r.constraints as Record<string, unknown>) ?? {},
      default_parameters: (r.default_parameters as Record<string, unknown>) ?? {},
      quality_checks: (r.quality_checks as Record<string, unknown>) ?? {},
      inputs_schema: (r.inputs_schema as Record<string, unknown>) ?? {},
      output_schema: (r.output_schema as Record<string, unknown>) ?? {},
    });
    currentId = r.parent_recipe_id ?? null;
  }

  const main = recipesById.get(recipeId)!;
  const ancestry = buildAncestryChain(main, recipesById);

  const recipeIds = ancestry.map((a) => a.id);
  const { data: allSteps } = await supabase
    .from("recipe_steps")
    .select("*")
    .in("recipe_id", recipeIds)
    .order("step_number");

  const stepsByRecipeId = new Map<string, RecipeStepRow[]>();
  for (const id of recipeIds) stepsByRecipeId.set(id, []);

  for (const s of allSteps ?? []) {
    const list = stepsByRecipeId.get(s.recipe_id) ?? [];
    list.push({
      step_number: s.step_number,
      title: s.title,
      instruction: s.instruction,
      required: s.required,
      estimated_cost_level: s.estimated_cost_level,
      metadata: (s.metadata as Record<string, unknown>) ?? {},
      source_recipe_id: s.recipe_id,
      is_override: false,
    });
    stepsByRecipeId.set(s.recipe_id, list);
  }

  const resolved = resolveRecipeInheritance(main, ancestry, stepsByRecipeId);

  const [
    { data: versions },
    { data: knowledge },
    { data: workflows },
    { data: failures },
    { data: dependencies },
  ] = await Promise.all([
    supabase
      .from("recipe_versions")
      .select("*")
      .eq("recipe_id", recipeId)
      .order("version_number", { ascending: false }),
    supabase
      .from("recipe_knowledge_links")
      .select("*, knowledge_records(id, title)")
      .eq("recipe_id", recipeId),
    supabase
      .from("recipe_workflow_links")
      .select("*, workflows(id, title)")
      .eq("recipe_id", recipeId),
    supabase
      .from("recipe_failure_links")
      .select("*, failure_records(id, symptom)")
      .eq("recipe_id", recipeId),
    supabase
      .from("recipe_dependencies")
      .select("*, depends_on:recipes!depends_on_recipe_id(id, title), recipe_dependency_types(code, label)")
      .eq("recipe_id", recipeId),
  ]);

  const { data: localStepsRaw } = await supabase
    .from("recipe_steps")
    .select("id, step_number, title, instruction, required, estimated_cost_level")
    .eq("recipe_id", recipeId)
    .order("step_number");

  return {
    recipe: { ...main, ...recipe } as RecipeRow & Record<string, unknown>,
    resolved,
    localSteps: localStepsRaw ?? [],
    versions: versions ?? [],
    links: {
      knowledge: knowledge ?? [],
      workflows: workflows ?? [],
      failures: failures ?? [],
      dependencies: dependencies ?? [],
    },
  };
}
