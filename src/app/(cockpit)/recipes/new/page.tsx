import {
  listAllRecipesForParentSelect,
  listRecipeCategories,
  listRecipeVariantTypes,
} from "@/actions/recipes";
import { listEntities, listKnowledgeDomains } from "@/actions/entities";
import { PageHeader } from "@/components/cockpit/page-header";
import { RecipeRecordForm } from "@/components/recipes/recipe-record-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewRecipePage() {
  const [domains, categories, variantTypes, parentOptions, entities] =
    await Promise.all([
      listKnowledgeDomains(),
      listRecipeCategories(),
      listRecipeVariantTypes(),
      listAllRecipesForParentSelect(),
      listEntities("comfyui"),
    ]);

  return (
    <>
      <PageHeader
        title="New recipe"
        description="Create a root recipe or a child variant that inherits from a parent — override only what differs"
      />

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Recipe details</CardTitle>
        </CardHeader>
        <CardContent>
          <RecipeRecordForm
            mode="create"
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
          />
        </CardContent>
      </Card>
    </>
  );
}
