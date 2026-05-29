"use client";

import { useMemo, useState } from "react";
import { createRecipe, updateRecipe } from "@/actions/recipes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Lookup = { code: string; label: string };
type Domain = Lookup & { id: string };
type ParentOption = { id: string; title: string; recipe_slug: string | null; domain_id: string };
type Entity = { id: string; canonical_slug: string; display_name: string };

type Initial = {
  domain_code?: string;
  title?: string;
  recipe_slug?: string;
  objective?: string | null;
  description?: string | null;
  category_code?: string;
  variant_type_code?: string;
  parent_recipe_id?: string | null;
  entity_id?: string | null;
  constraints?: Record<string, unknown>;
  default_parameters?: Record<string, unknown>;
  quality_checks?: Record<string, unknown>;
  safety_notes?: string | null;
};

export function RecipeRecordForm({
  mode,
  recipeId,
  domains,
  categories,
  variantTypes,
  parentOptions,
  entities,
  initial,
}: {
  mode: "create" | "edit";
  recipeId?: string;
  domains: Domain[];
  categories: Lookup[];
  variantTypes: Lookup[];
  parentOptions: ParentOption[];
  entities: Entity[];
  initial?: Initial;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [domainCode, setDomainCode] = useState(
    initial?.domain_code ?? domains.find((d) => d.code === "comfyui")?.code ?? domains[0]?.code
  );

  const domainId = domains.find((d) => d.code === domainCode)?.id;

  const filteredParents = useMemo(
    () => parentOptions.filter((p) => p.domain_id === domainId && p.id !== recipeId),
    [parentOptions, domainId, recipeId]
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const result =
      mode === "create"
        ? await createRecipe(formData)
        : await updateRecipe(recipeId!, formData);
    setPending(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(mode === "create" ? "Recipe created" : "Recipe updated");
    if (mode === "create" && "id" in result) {
      router.push(`/recipes/${result.id}`);
    } else {
      router.refresh();
    }
  }

  const jsonString = (v: Record<string, unknown> | undefined) =>
    v && Object.keys(v).length > 0 ? JSON.stringify(v, null, 2) : "";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="domain_code">Domain *</Label>
          <select
            id="domain_code"
            name="domain_code"
            required
            value={domainCode}
            onChange={(e) => setDomainCode(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {domains.map((d) => (
              <option key={d.code} value={d.code}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="recipe_slug">Slug *</Label>
          <Input
            id="recipe_slug"
            name="recipe_slug"
            required
            pattern="[a-z0-9_]+"
            defaultValue={initial?.recipe_slug}
            placeholder="base_poster"
            className="font-mono text-sm"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input id="title" name="title" required defaultValue={initial?.title} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="objective">Objective</Label>
        <Textarea
          id="objective"
          name="objective"
          rows={2}
          defaultValue={initial?.objective ?? ""}
          placeholder="What this recipe achieves (child may leave empty to inherit)"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={initial?.description ?? ""}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category_code">Category *</Label>
          <select
            id="category_code"
            name="category_code"
            required
            defaultValue={initial?.category_code ?? categories[0]?.code}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="variant_type_code">Variant type *</Label>
          <select
            id="variant_type_code"
            name="variant_type_code"
            required
            defaultValue={initial?.variant_type_code ?? variantTypes[0]?.code}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {variantTypes.map((v) => (
              <option key={v.code} value={v.code}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="parent_recipe_id">Parent recipe</Label>
          <select
            id="parent_recipe_id"
            name="parent_recipe_id"
            defaultValue={initial?.parent_recipe_id ?? ""}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">None (root recipe)</option>
            {filteredParents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.recipe_slug ? ` (${p.recipe_slug})` : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Child recipes inherit constraints, parameters, and steps from the parent.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="entity_id">Canonical entity</Label>
          <select
            id="entity_id"
            name="entity_id"
            defaultValue={initial?.entity_id ?? ""}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">None</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.display_name} ({e.canonical_slug})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="constraints">Constraints (JSON)</Label>
        <Textarea
          id="constraints"
          name="constraints"
          rows={4}
          className="font-mono text-xs"
          defaultValue={jsonString(initial?.constraints)}
          placeholder='{"min_resolution":"2048x2048"}'
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="default_parameters">Default parameters (JSON)</Label>
        <Textarea
          id="default_parameters"
          name="default_parameters"
          rows={3}
          className="font-mono text-xs"
          defaultValue={jsonString(initial?.default_parameters)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="quality_checks">Quality checks (JSON)</Label>
        <Textarea
          id="quality_checks"
          name="quality_checks"
          rows={3}
          className="font-mono text-xs"
          defaultValue={jsonString(initial?.quality_checks)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="safety_notes">Safety notes</Label>
        <Textarea
          id="safety_notes"
          name="safety_notes"
          rows={2}
          defaultValue={initial?.safety_notes ?? ""}
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : mode === "create" ? "Create recipe" : "Save changes"}
      </Button>
    </form>
  );
}
