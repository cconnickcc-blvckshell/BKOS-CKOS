import { getDecisionRequest } from "@/actions/decision";
import { PageHeader } from "@/components/cockpit/page-header";
import { DecisionRecommendationView } from "@/components/decision/decision-recommendation-view";
import { RebuildRecommendationButton } from "@/components/decision/rebuild-recommendation-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function DecisionRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  try {
    data = await getDecisionRequest(id);
  } catch {
    notFound();
  }

  const { request, constraints, recommendation, items, sourceLinks } = data;

  return (
    <>
      <PageHeader
        title="Decision request"
        description={request.goal_text}
        actions={
          <>
            <RebuildRecommendationButton requestId={id} />
            <Badge variant="secondary">
              {(request.decision_statuses as { label: string }).label}
            </Badge>
            <Badge variant="outline">
              {(request.decision_goal_types as { label: string }).label}
            </Badge>
          </>
        }
      />

      <div className="mb-6 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
        {request.desired_output && (
          <p>
            <span className="font-medium text-foreground">Desired output:</span>{" "}
            {request.desired_output}
          </p>
        )}
        {(request.hardware_tiers as { label: string } | null) && (
          <p>
            <span className="font-medium text-foreground">Hardware:</span>{" "}
            {(request.hardware_tiers as { label: string }).label}
          </p>
        )}
        {(request.knowledge_domains as { label: string } | null) && (
          <p>
            <span className="font-medium text-foreground">Domain:</span>{" "}
            {(request.knowledge_domains as { label: string }).label}
          </p>
        )}
      </div>

      {constraints.length > 0 && (
        <Card className="mb-6 border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Constraints</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {constraints.map((c) => {
                const ct = c.decision_constraint_types as { label: string; code: string };
                return (
                  <li key={c.id}>
                    <span className="font-medium">{ct.label}:</span>{" "}
                    {c.value_text ?? JSON.stringify(c.value_json)}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {recommendation ? (
        <DecisionRecommendationView
          recommendation={
            recommendation as Parameters<typeof DecisionRecommendationView>[0]["recommendation"]
          }
          items={items as Parameters<typeof DecisionRecommendationView>[0]["items"]}
          sourceLinks={
            sourceLinks as Parameters<typeof DecisionRecommendationView>[0]["sourceLinks"]
          }
        />
      ) : (
        <Card className="border-border/60">
          <CardContent className="py-8 text-sm text-muted-foreground">
            No recommendation yet.{" "}
            <Link href="/decision/new" className="text-primary hover:underline">
              Create a new request
            </Link>{" "}
            or use Rebuild recommendation.
          </CardContent>
        </Card>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        <Link href="/decision" className="hover:text-primary">
          ← All decision requests
        </Link>
      </p>
    </>
  );
}
