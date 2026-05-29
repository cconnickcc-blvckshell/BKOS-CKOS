import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { AlertTriangle, BookOpen, ChefHat, Workflow, AlertCircle } from "lucide-react";

type Recommendation = {
  id: string;
  confidence_score: number;
  recommended_approach: string;
  suggested_model_family: string | null;
  missing_information: string[] | unknown;
  warnings: string[] | unknown;
  retrieval_metadata: Record<string, unknown>;
  decision_statuses: { code: string; label: string } | null;
};

type Item = {
  id: string;
  item_role: string;
  title: string;
  summary: string | null;
  rationale: string;
  confidence_score: number | null;
  knowledge_record_id: string | null;
  workflow_id: string | null;
  workflow_analysis_id: string | null;
  failure_record_id: string | null;
  recipe_id: string | null;
};

type SourceLink = {
  id: string;
  linked_entity_type: string;
  linked_entity_id: string;
  citation_text: string;
  decision_recommendation_item_id: string | null;
};

function itemHref(item: Item): string | null {
  if (item.knowledge_record_id) return `/knowledge/${item.knowledge_record_id}`;
  if (item.recipe_id) return `/recipes/${item.recipe_id}`;
  if (item.workflow_id) return `/workflows/${item.workflow_id}`;
  if (item.failure_record_id) return `/failures/${item.failure_record_id}`;
  return null;
}

function roleIcon(role: string) {
  if (role === "failure_warning") return AlertTriangle;
  if (role === "recipe") return ChefHat;
  if (role === "workflow") return Workflow;
  return BookOpen;
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    knowledge_required: "Knowledge",
    recipe: "Recipe",
    workflow: "Workflow",
    failure_warning: "Failure warning",
  };
  return labels[role] ?? role;
}

export function DecisionRecommendationView({
  recommendation,
  items,
  sourceLinks,
}: {
  recommendation: Recommendation;
  items: Item[];
  sourceLinks: SourceLink[];
}) {
  const missing = Array.isArray(recommendation.missing_information)
    ? (recommendation.missing_information as string[])
    : [];
  const warnings = Array.isArray(recommendation.warnings)
    ? (recommendation.warnings as string[])
    : [];
  const lowConfidence = Number(recommendation.confidence_score) <= 0.35;
  const insufficient = recommendation.decision_statuses?.code === "insufficient_evidence";

  return (
    <div className="space-y-6">
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Recommendation</CardTitle>
            <Badge variant="secondary">
              {recommendation.decision_statuses?.label ?? "Ready"}
            </Badge>
            <Badge variant={lowConfidence || insufficient ? "destructive" : "outline"}>
              Confidence {(Number(recommendation.confidence_score) * 100).toFixed(0)}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-medium text-muted-foreground">Recommended approach</p>
            <p className="mt-1">{recommendation.recommended_approach}</p>
          </div>
          {recommendation.suggested_model_family && (
            <div>
              <p className="font-medium text-muted-foreground">Suggested model family</p>
              <p className="mt-1">{recommendation.suggested_model_family}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {(missing.length > 0 || warnings.length > 0) && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="size-4" />
              Warnings & missing information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {warnings.map((w, i) => (
              <p key={`w-${i}`} className="text-muted-foreground">
                {w}
              </p>
            ))}
            {missing.map((m, i) => (
              <p key={`m-${i}`} className="text-amber-800 dark:text-amber-200">
                {m}
              </p>
            ))}
            {insufficient && (
              <p className="font-medium">
                Insufficient evidence in CKOS — add more knowledge, workflows, or recipes before
                relying on this recommendation.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Evidence items ({items.length})
        </h2>
        <div className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No linked CKOS records.</p>
          ) : (
            items.map((item) => {
              const Icon = roleIcon(item.item_role);
              const href = itemHref(item);
              return (
                <div
                  key={item.id}
                  className="rounded-lg border border-border/60 p-4 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <Badge variant="outline">{roleLabel(item.item_role)}</Badge>
                    {href ? (
                      <Link href={href} className="font-medium hover:text-primary">
                        {item.title}
                      </Link>
                    ) : (
                      <span className="font-medium">{item.title}</span>
                    )}
                  </div>
                  {item.summary && (
                    <p className="mt-2 text-muted-foreground">{item.summary}</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">{item.rationale}</p>
                </div>
              );
            })
          )}
        </div>
      </section>

      {sourceLinks.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Citations</h2>
          <ul className="space-y-1 text-sm">
            {sourceLinks.map((link) => (
              <li key={link.id} className="text-muted-foreground">
                {link.citation_text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
