import {
  loadResolvedRecipe,
  listFailuresForRecipeLink,
  listKnowledgeForRecipeLink,
  listRecipeCategories,
  listRecipeVariantTypes,
  listAllRecipesForParentSelect,
  listWorkflowsForRecipeLink,
} from "@/actions/recipes";
import { listEntities, listKnowledgeDomains } from "@/actions/entities";
import { PageHeader } from "@/components/cockpit/page-header";
import { RecipeInheritancePanel } from "@/components/recipes/recipe-inheritance-panel";
import { RecipeLinksPanel } from "@/components/recipes/recipe-links-panel";
import { RecipeRecordForm } from "@/components/recipes/recipe-record-form";
import { RecipeStepsPanel } from "@/components/recipes/recipe-steps-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  try {
    data = await loadResolvedRecipe(id);
  } catch {
    notFound();
  }

  const { recipe, resolved, localSteps, versions, links } = data;

  const [
    domains,
    categories,
    variantTypes,
    parentOptions,
    entities,
    workflows,
    knowledgeRecords,
    failures,
  ] = await Promise.all([
    listKnowledgeDomains(),
    listRecipeCategories(),
    listRecipeVariantTypes(),
    listAllRecipesForParentSelect(),
    listEntities(
      (recipe as { knowledge_domains?: { code?: string } }).knowledge_domains?.code ??
        "comfyui"
    ),
    listWorkflowsForRecipeLink(),
    listKnowledgeForRecipeLink(),
    listFailuresForRecipeLink(),
  ]);

  const domainCode = (
    recipe as { knowledge_domains?: { code: string } }
  ).knowledge_domains?.code;
  const categoryCode = (
    recipe as { recipe_categories?: { code: string } }
  ).recipe_categories?.code;
  const variantCode = (
    recipe as { recipe_variant_types?: { code: string } }
  ).recipe_variant_types?.code;
  const parent = (
    recipe as { parent?: { id: string; title: string; recipe_slug: string | null } }
  ).parent;

  return (
    <>
      <PageHeader
        title={recipe.title}
        description={recipe.objective ?? recipe.goal ?? undefined}
        actions={
          <>
            <Badge variant="secondary">
              {(recipe as { recipe_categories?: { label: string } }).recipe_categories?.label}
            </Badge>
            <Badge variant="outline">
              {(recipe as { recipe_variant_types?: { label: string } }).recipe_variant_types
                ?.label}
            </Badge>
            {parent && (
              <Badge variant="outline">
                extends{" "}
                <Link href={`/recipes/${parent.id}`} className="ml-1 underline">
                  {parent.title}
                </Link>
              </Badge>
            )}
          </>
        }
      />

      <div className="mb-8">
        <h2 className="mb-4 font-heading text-lg font-medium">Resolved recipe</h2>
        <RecipeInheritancePanel resolved={resolved} recipeId={id} />
      </div>

      <Card className="mb-6 border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Edit recipe</CardTitle>
        </CardHeader>
        <CardContent>
          <RecipeRecordForm
            mode="edit"
            recipeId={id}
            domains={domains.map((d) => ({
              id: d.id,
              code: d.code,
              label: d.label,
            }))}
            categories={categories.map((c) => ({ code: c.code, label: c.label }))}
            variantTypes={variantTypes.map((v) => ({ code: v.code, label: v.label }))}
            parentOptions={parentOptions}
            entities={entities.map((e) => ({
              id: e.id,
              canonical_slug: e.canonical_slug,
              display_name: e.display_name,
            }))}
            initial={{
              domain_code: domainCode,
              title: recipe.title,
              recipe_slug: recipe.recipe_slug ?? undefined,
              objective: recipe.objective,
              description: recipe.description,
              category_code: categoryCode,
              variant_type_code: variantCode,
              parent_recipe_id: recipe.parent_recipe_id,
              entity_id: recipe.entity_id,
              constraints: recipe.constraints as Record<string, unknown>,
              default_parameters: recipe.default_parameters as Record<string, unknown>,
              quality_checks: recipe.quality_checks as Record<string, unknown>,
              safety_notes: recipe.safety_notes,
            }}
          />
        </CardContent>
      </Card>

      <div className="mb-6">
        <RecipeStepsPanel recipeId={id} steps={localSteps} />
      </div>

      {versions.length > 0 && (
        <Card className="mb-6 border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Version history</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {(versions as { version_number: number; change_notes: string | null; created_at: string }[]).map(
                (v) => (
                  <li
                    key={v.version_number}
                    className="rounded-md border border-border/50 p-3"
                  >
                    <span className="font-medium">v{v.version_number}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {new Date(v.created_at).toLocaleString()}
                    </span>
                    {v.change_notes && (
                      <p className="mt-1 text-muted-foreground">{v.change_notes}</p>
                    )}
                  </li>
                )
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="mb-6">
        <RecipeLinksPanel
          recipeId={id}
          workflowLinks={
            links.workflows as Parameters<typeof RecipeLinksPanel>[0]["workflowLinks"]
          }
          knowledgeLinks={
            links.knowledge as Parameters<typeof RecipeLinksPanel>[0]["knowledgeLinks"]
          }
          failureLinks={
            links.failures as Parameters<typeof RecipeLinksPanel>[0]["failureLinks"]
          }
          workflows={workflows}
          knowledgeRecords={knowledgeRecords}
          failures={failures}
        />
      </div>
    </>
  );
}
