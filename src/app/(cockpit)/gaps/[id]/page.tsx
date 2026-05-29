import { getKnowledgeGap, listGapStatuses } from "@/actions/gaps";
import { PageHeader } from "@/components/cockpit/page-header";
import { GapResolutionForm } from "@/components/gaps/gap-resolution-form";
import { SuggestSourcesForGapButton } from "@/components/discovery/suggest-sources-button";
import { GapDiscoverySuggestions } from "@/components/discovery/gap-discovery-suggestions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

function evidenceHref(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  switch (type) {
    case "knowledge_record":
      return `/knowledge/${id}`;
    case "entity":
      return `/entities/${id}`;
    case "curation_campaign":
      return `/curation/${id}`;
    case "workflow":
      return `/workflows/${id}`;
    case "failure_record":
      return `/failures/${id}`;
    case "recipe":
      return `/recipes/${id}`;
    case "source_extraction_result":
      return null;
    default:
      return null;
  }
}

export default async function KnowledgeGapDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  let statuses;
  try {
    [data, statuses] = await Promise.all([getKnowledgeGap(id), listGapStatuses()]);
  } catch {
    notFound();
  }

  const { gap, evidence } = data;
  const statusCode = (gap.gap_statuses as { code: string }).code;

  return (
    <>
      <PageHeader
        title={gap.title}
        description={gap.description ?? undefined}
        actions={
          <>
            <SuggestSourcesForGapButton gapId={id} />
            <Badge variant="outline">{(gap.gap_types as { label: string }).label}</Badge>
            <Badge variant="secondary">{(gap.gap_statuses as { label: string }).label}</Badge>
            <Badge
              variant={
                (gap.gap_severity_levels as { code: string }).code === "critical"
                  ? "destructive"
                  : "outline"
              }
            >
              {(gap.gap_severity_levels as { label: string }).label}
            </Badge>
            <Badge variant="outline">{gap.detection_source}</Badge>
          </>
        }
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Resolution</CardTitle>
          </CardHeader>
          <CardContent>
            <GapResolutionForm
              gapId={id}
              statuses={statuses.map((s) => ({ code: s.code, label: s.label }))}
              currentStatusCode={statusCode}
              currentNotes={gap.resolution_notes}
            />
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(gap.knowledge_domains as { label: string } | null) && (
              <p>
                <span className="text-muted-foreground">Domain:</span>{" "}
                {(gap.knowledge_domains as { label: string }).label}
              </p>
            )}
            {(gap.entities as { display_name: string; canonical_slug: string } | null) && (
              <p>
                <span className="text-muted-foreground">Entity:</span>{" "}
                <Link
                  href={`/entities/${gap.entity_id}`}
                  className="text-primary hover:underline"
                >
                  {(gap.entities as { display_name: string }).display_name}
                </Link>
              </p>
            )}
            {(gap.curation_campaigns as { title: string; id?: string } | null) && (
              <p>
                <span className="text-muted-foreground">Campaign:</span>{" "}
                <Link
                  href={`/curation/${gap.campaign_id}`}
                  className="text-primary hover:underline"
                >
                  {(gap.curation_campaigns as { title: string }).title}
                </Link>
              </p>
            )}
            {gap.resolved_at && (
              <p className="text-muted-foreground">
                Resolved {new Date(gap.resolved_at).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-6">
        <GapDiscoverySuggestions gapId={id} />
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Evidence ({evidence.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            {evidence.map((e) => {
              const href = evidenceHref(e.linked_entity_type, e.linked_entity_id);
              return (
                <li key={e.id} className="rounded-md border border-border/50 p-3">
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{e.evidence_type}</Badge>
                    {e.linked_entity_type && (
                      <span>
                        {e.linked_entity_type}
                        {e.linked_entity_id && ` · ${e.linked_entity_id.slice(0, 8)}…`}
                      </span>
                    )}
                  </div>
                  <p className="mt-2">{e.evidence_summary}</p>
                  {href && (
                    <Link href={href} className="mt-2 inline-block text-primary hover:underline">
                      View record →
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <p className="mt-8 text-xs text-muted-foreground">
        <Link href="/gaps" className="hover:text-primary">
          ← All knowledge gaps
        </Link>
      </p>
    </>
  );
}
