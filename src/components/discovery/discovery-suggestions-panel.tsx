import { listDiscoverySuggestionsForCampaign } from "@/actions/discovery";
import { DiscoverySuggestionActions } from "@/components/discovery/discovery-suggestion-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

type Suggestion = Awaited<ReturnType<typeof listDiscoverySuggestionsForCampaign>>[0];

export function DiscoverySuggestionsPanel({
  suggestions,
  title = "Source discovery suggestions",
}: {
  suggestions: Suggestion[];
  title?: string;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title} ({suggestions.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No suggestions yet. Run Suggest sources after analyzing gaps.
          </p>
        ) : (
          suggestions.map((s) => {
            const status = s.discovery_statuses as { code: string; label: string };
            const source = s.discovery_suggestion_sources as { label: string };
            const gap = s.knowledge_gaps as {
              id: string;
              title: string;
              gap_types?: { label: string };
            } | null;

            return (
              <div
                key={s.id}
                className="rounded-md border border-border/50 p-3 text-sm space-y-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <a
                      href={s.suggested_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline break-all"
                    >
                      {s.title ?? s.normalized_url}
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">{s.reason}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">{status?.label}</Badge>
                    <Badge variant="outline">{source?.label}</Badge>
                    <Badge variant="outline">
                      {(Number(s.confidence_score) * 100).toFixed(0)}%
                    </Badge>
                  </div>
                </div>
                {gap && (
                  <p className="text-xs text-muted-foreground">
                    Gap:{" "}
                    <Link href={`/gaps/${gap.id}`} className="text-primary hover:underline">
                      {gap.title}
                    </Link>
                  </p>
                )}
                <DiscoverySuggestionActions
                  suggestionId={s.id}
                  statusCode={status?.code ?? "proposed"}
                  hasCampaign={Boolean(s.campaign_id)}
                />
              </div>
            );
          })
        )}
        <Link href="/discovery" className="text-xs text-primary hover:underline">
          Discovery dashboard →
        </Link>
      </CardContent>
    </Card>
  );
}

export async function CampaignDiscoverySuggestionsPanel({
  campaignId,
}: {
  campaignId: string;
}) {
  const suggestions = await listDiscoverySuggestionsForCampaign(campaignId);
  return <DiscoverySuggestionsPanel suggestions={suggestions} />;
}
