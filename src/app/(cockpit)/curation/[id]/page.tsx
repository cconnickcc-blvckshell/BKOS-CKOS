import { getCurationCampaign, listSourceTypesForCampaign } from "@/actions/curation";
import { PageHeader } from "@/components/cockpit/page-header";
import { AddCampaignUrlForm } from "@/components/curation/add-campaign-url-form";
import { CampaignBatchActions } from "@/components/curation/campaign-batch-actions";
import { CampaignProgressCard } from "@/components/curation/campaign-progress-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { notFound } from "next/navigation";

function outputHref(entityType: string, entityId: string): string {
  switch (entityType) {
    case "knowledge_record":
      return `/knowledge/${entityId}`;
    case "workflow":
      return `/workflows/${entityId}`;
    case "failure_record":
      return `/failures/${entityId}`;
    case "recipe":
      return `/recipes/${entityId}`;
    case "entity":
      return `/entities/${entityId}`;
    default:
      return "#";
  }
}

export default async function CurationCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  try {
    data = await getCurationCampaign(id);
  } catch {
    notFound();
  }

  const sourceTypes = await listSourceTypesForCampaign();
  const { campaign, sources, outputs, metrics } = data;

  const targetTopics = campaign.target_topics as unknown[];
  const targetEntities = campaign.target_entities as unknown[];

  return (
    <>
      <PageHeader
        title={campaign.title}
        description={campaign.objective ?? campaign.description ?? undefined}
        actions={
          <>
            <CampaignBatchActions campaignId={id} />
            <Badge variant="secondary">
              {(campaign.curation_campaign_statuses as { label: string }).label}
            </Badge>
            <Link
              href={`/curation/${id}/edit`}
              className="text-sm text-primary hover:underline"
            >
              Edit
            </Link>
          </>
        }
      />

      <p className="mb-6 text-sm text-muted-foreground">
        Domain: {(campaign.knowledge_domains as { label: string }).label}
        {campaign.description && <> · {campaign.description}</>}
      </p>

      <div className="mb-6">
        <CampaignProgressCard metrics={metrics} />
      </div>

      {(targetTopics.length > 0 || targetEntities.length > 0) && (
        <Card className="mb-6 border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Target scope</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
            {targetTopics.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground">Topics</p>
                <pre className="mt-1 overflow-auto rounded-md bg-muted p-2 text-xs">
                  {JSON.stringify(targetTopics, null, 2)}
                </pre>
              </div>
            )}
            {targetEntities.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground">Entities</p>
                <pre className="mt-1 overflow-auto rounded-md bg-muted p-2 text-xs">
                  {JSON.stringify(targetEntities, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mb-6 border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Add trusted URL</CardTitle>
        </CardHeader>
        <CardContent>
          <AddCampaignUrlForm campaignId={id} sourceTypes={sourceTypes} />
        </CardContent>
      </Card>

      <Card className="mb-6 border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Campaign sources ({sources.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Pipeline status</TableHead>
                <TableHead>Fetch</TableHead>
                <TableHead>Normalization</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No URLs yet. Add trusted URLs above.
                  </TableCell>
                </TableRow>
              ) : (
                sources.map((s) => {
                  const source = s.sources as { id: string; title: string; url: string | null };
                  const srcStatus = s.curation_campaign_source_statuses as {
                    label: string;
                    code: string;
                  };
                  const fetchJob = s.source_fetch_jobs as {
                    id: string;
                    acquisition_statuses: { label: string } | null;
                  } | null;
                  const normJob = s.normalization_jobs as {
                    id: string;
                    normalization_statuses: { label: string } | null;
                  } | null;

                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link
                          href={`/sources/${source.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {source.title}
                        </Link>
                        {source.url && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground max-w-md">
                            {source.url}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{srcStatus?.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fetchJob ? (
                          <Link
                            href={`/sources/${source.id}`}
                            className="hover:text-primary"
                          >
                            {fetchJob.acquisition_statuses?.label ?? "Job"}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {s.source_extraction_results && (
                          <span className="block">Extraction linked</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {normJob ? (
                          <Link
                            href={`/normalization/${normJob.id}`}
                            className="hover:text-primary"
                          >
                            {normJob.normalization_statuses?.label ?? "Job"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Campaign outputs ({outputs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {outputs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Approved knowledge and related entities appear here after human review and sync.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {outputs.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{o.output_role}</Badge>
                  <Badge variant="outline">{o.entity_type}</Badge>
                  <Link href={outputHref(o.entity_type, o.entity_id)} className="hover:text-primary">
                    {o.entity_type} → {o.entity_id.slice(0, 8)}…
                  </Link>
                  {o.notes && (
                    <span className="text-xs text-muted-foreground">{o.notes}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="mt-8 text-xs text-muted-foreground">
        <Link href="/curation" className="hover:text-primary">
          ← All campaigns
        </Link>
      </p>
    </>
  );
}
