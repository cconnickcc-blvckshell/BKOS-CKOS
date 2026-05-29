import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import type { ResolvedRecipe } from "@/lib/recipes/inheritance";

export function RecipeInheritancePanel({
  resolved,
  recipeId,
}: {
  resolved: ResolvedRecipe;
  recipeId: string;
}) {
  const { resolved: merged, ancestry, provenance } = resolved;

  const overrideFields = new Set(
    provenance.filter((p) => p.overridden_by_child).map((p) => p.field)
  );

  return (
    <div className="space-y-4">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Inheritance chain</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {ancestry.length <= 1 ? (
            <p className="text-muted-foreground">Root recipe (no parent).</p>
          ) : (
            <ol className="list-decimal space-y-1 pl-5">
              {ancestry.slice(0, -1).map((a) => (
                <li key={a.id}>
                  <Link href={`/recipes/${a.id}`} className="font-medium hover:text-primary">
                    {a.title}
                  </Link>
                  {a.recipe_slug ? (
                    <span className="font-mono text-muted-foreground"> ({a.recipe_slug})</span>
                  ) : null}
                </li>
              ))}
              <li className="font-medium text-primary">
                {merged.title} (current)
              </li>
            </ol>
          )}
        </CardContent>
      </Card>

      {provenance.length > 0 && (
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Child overrides</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {provenance
                .filter((p) => p.overridden_by_child)
                .map((p, i) => (
                  <li key={`${p.field}-${i}`} className="flex items-center gap-2">
                    <Badge variant="secondary">{p.field}</Badge>
                    <span className="text-muted-foreground">on this recipe</span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Resolved fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ResolvedField
            label="Objective"
            value={merged.objective}
            isOverride={overrideFields.has("objective")}
          />
          <ResolvedJson
            label="Constraints"
            value={merged.constraints}
            isOverride={overrideFields.has("constraints")}
          />
          <ResolvedJson
            label="Default parameters"
            value={merged.default_parameters}
            isOverride={overrideFields.has("default_parameters")}
          />
          <ResolvedJson
            label="Quality checks"
            value={merged.quality_checks}
            isOverride={overrideFields.has("quality_checks")}
          />
          <ResolvedJson
            label="Inputs schema"
            value={merged.inputs_schema}
            isOverride={false}
          />
          <ResolvedJson
            label="Output schema"
            value={merged.output_schema}
            isOverride={false}
          />
          {merged.safety_notes ? (
            <ResolvedField
              label="Safety notes"
              value={merged.safety_notes}
              isOverride={overrideFields.has("safety_notes")}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Resolved steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {merged.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No steps defined.</p>
          ) : (
            merged.steps.map((step) => (
              <div
                key={`${step.step_number}-${step.title}`}
                className="rounded-md border border-border/50 p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {step.step_number}. {step.title}
                  </span>
                  {step.is_override ? (
                    <Badge variant="secondary">override</Badge>
                  ) : step.source_recipe_id !== recipeId ? (
                    <Badge variant="outline">inherited</Badge>
                  ) : (
                    <Badge>local</Badge>
                  )}
                  {step.required ? (
                    <Badge variant="outline">required</Badge>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                  {step.instruction}
                </p>
                {step.estimated_cost_level ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cost: {step.estimated_cost_level}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FieldBadge({ isOverride }: { isOverride: boolean }) {
  if (isOverride) return <Badge variant="secondary">override</Badge>;
  return <Badge variant="outline">resolved</Badge>;
}

function ResolvedField({
  label,
  value,
  isOverride,
}: {
  label: string;
  value: string | null;
  isOverride: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="font-medium">{label}</span>
        <FieldBadge isOverride={isOverride} />
      </div>
      <p className="whitespace-pre-wrap text-muted-foreground">{value ?? "—"}</p>
    </div>
  );
}

function ResolvedJson({
  label,
  value,
  isOverride,
}: {
  label: string;
  value: Record<string, unknown>;
  isOverride: boolean;
}) {
  const empty = Object.keys(value).length === 0;
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="font-medium">{label}</span>
        <FieldBadge isOverride={isOverride} />
      </div>
      {empty ? (
        <p className="text-muted-foreground">—</p>
      ) : (
        <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}
