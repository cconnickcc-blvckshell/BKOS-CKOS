/**
 * Deterministic recipe inheritance resolver.
 * Merges ancestor chain root → child; child values override parents.
 */

export type RecipeRow = {
  id: string;
  title: string;
  recipe_slug: string | null;
  objective: string | null;
  goal: string | null;
  description: string | null;
  constraints: Record<string, unknown>;
  default_parameters: Record<string, unknown>;
  quality_checks: Record<string, unknown>;
  safety_notes: string | null;
  inputs_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  steps?: unknown[];
  parent_recipe_id?: string | null;
  entity_id?: string | null;
  domain_id?: string | null;
};

export type RecipeStepRow = {
  step_number: number;
  title: string;
  instruction: string;
  required: boolean;
  estimated_cost_level: string | null;
  metadata: Record<string, unknown>;
  source_recipe_id: string;
  is_override: boolean;
};

export type FieldProvenance = {
  field: string;
  source_recipe_id: string;
  source_title: string;
  overridden_by_child: boolean;
};

export type ResolvedRecipe = {
  resolved: {
    title: string;
    objective: string | null;
    description: string | null;
    constraints: Record<string, unknown>;
    default_parameters: Record<string, unknown>;
    quality_checks: Record<string, unknown>;
    safety_notes: string | null;
    inputs_schema: Record<string, unknown>;
    output_schema: Record<string, unknown>;
    steps: RecipeStepRow[];
  };
  ancestry: { id: string; title: string; recipe_slug: string | null }[];
  provenance: FieldProvenance[];
};

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof out[key] === "object" &&
      out[key] !== null &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(
        out[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else if (value !== undefined && value !== null && value !== "") {
      out[key] = value;
    }
  }
  return out;
}

function pickObjective(row: RecipeRow): string | null {
  return row.objective ?? row.goal ?? null;
}

function mergeSteps(
  ancestryRows: RecipeRow[],
  stepsByRecipeId: Map<string, RecipeStepRow[]>
): RecipeStepRow[] {
  const merged = new Map<number, RecipeStepRow>();

  for (const ancestor of ancestryRows) {
    const steps = stepsByRecipeId.get(ancestor.id) ?? [];
    for (const step of steps) {
      merged.set(step.step_number, {
        ...step,
        source_recipe_id: ancestor.id,
        is_override: false,
      });
    }
  }

  const child = ancestryRows[ancestryRows.length - 1];
  const childSteps = stepsByRecipeId.get(child.id) ?? [];
  for (const step of childSteps) {
    const hadParent = [...merged.keys()].includes(step.step_number);
    merged.set(step.step_number, {
      ...step,
      source_recipe_id: child.id,
      is_override: hadParent,
    });
  }

  return [...merged.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, step]) => step);
}

export function resolveRecipeInheritance(
  recipe: RecipeRow,
  ancestryOldestFirst: RecipeRow[],
  stepsByRecipeId: Map<string, RecipeStepRow[]>
): ResolvedRecipe {
  const chain = ancestryOldestFirst.length > 0 ? ancestryOldestFirst : [recipe];
  const child = chain[chain.length - 1];

  let constraints: Record<string, unknown> = {};
  let default_parameters: Record<string, unknown> = {};
  let quality_checks: Record<string, unknown> = {};
  let inputs_schema: Record<string, unknown> = {};
  let output_schema: Record<string, unknown> = {};
  let objective: string | null = null;
  let description: string | null = null;
  let safety_notes: string | null = null;
  let title = "";

  const provenance: FieldProvenance[] = [];

  for (const row of chain) {
    const isChild = row.id === child.id;

    if (!title && row.title) title = row.title;
    if (row.title && isChild) title = row.title;

    const rowObjective = pickObjective(row);
    if (rowObjective) {
      if (objective && objective !== rowObjective && isChild) {
        provenance.push({
          field: "objective",
          source_recipe_id: row.id,
          source_title: row.title,
          overridden_by_child: true,
        });
      }
      objective = rowObjective;
      if (!isChild) {
        provenance.push({
          field: "objective",
          source_recipe_id: row.id,
          source_title: row.title,
          overridden_by_child: false,
        });
      }
    }

    if (row.description) description = row.description;

    constraints = deepMerge(constraints, row.constraints ?? {});
    default_parameters = deepMerge(default_parameters, row.default_parameters ?? {});
    quality_checks = deepMerge(quality_checks, row.quality_checks ?? {});
    inputs_schema = deepMerge(inputs_schema, row.inputs_schema ?? {});
    output_schema = deepMerge(output_schema, row.output_schema ?? {});

    if (row.safety_notes) safety_notes = row.safety_notes;

    if (isChild) {
      for (const field of [
        "constraints",
        "default_parameters",
        "quality_checks",
        "safety_notes",
      ] as const) {
        const parent = chain.length > 1 ? chain[chain.length - 2] : null;
        if (!parent) continue;
        const childVal = JSON.stringify(row[field === "safety_notes" ? "safety_notes" : field]);
        const parentVal = JSON.stringify(
          parent[field === "safety_notes" ? "safety_notes" : field]
        );
        if (childVal !== parentVal && childVal !== "{}" && childVal !== "null") {
          provenance.push({
            field,
            source_recipe_id: row.id,
            source_title: row.title,
            overridden_by_child: true,
          });
        }
      }
    }
  }

  const steps = mergeSteps(chain, stepsByRecipeId);

  return {
    resolved: {
      title,
      objective,
      description,
      constraints,
      default_parameters,
      quality_checks,
      safety_notes,
      inputs_schema,
      output_schema,
      steps,
    },
    ancestry: chain.map((r) => ({
      id: r.id,
      title: r.title,
      recipe_slug: r.recipe_slug,
    })),
    provenance,
  };
}

/** Walk parent_recipe_id chain; returns [root, ..., child] */
export function buildAncestryChain(
  recipe: RecipeRow,
  recipesById: Map<string, RecipeRow>
): RecipeRow[] {
  const chain: RecipeRow[] = [];
  const visited = new Set<string>();
  let current: RecipeRow | undefined = recipe;

  while (current) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    chain.unshift(current);
    if (!current.parent_recipe_id) break;
    current = recipesById.get(current.parent_recipe_id);
  }

  return chain;
}
