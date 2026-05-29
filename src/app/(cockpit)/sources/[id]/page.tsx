import { getSource } from "@/actions/sources";
import { getExtractionForVersion } from "@/actions/acquisition";
import { PageHeader } from "@/components/cockpit/page-header";
import { SourceVersionForm } from "@/components/forms/source-version-form";
import { FetchSourceButton } from "@/components/acquisition/fetch-source-button";
import { ExtractionReviewPanel } from "@/components/acquisition/extraction-review-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function SourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let source;
  try {
    source = await getSource(id);
  } catch {
    notFound();
  }

  const supabase = await createClient();
  const [{ data: versions }, { data: jobs }] = await Promise.all([
    supabase
      .from("source_versions")
      .select("*")
      .eq("source_id", id)
      .order("version_number", { ascending: false }),
    supabase
      .from("source_fetch_jobs")
      .select("*, acquisition_statuses(code, label)")
      .eq("source_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const latestVersion = versions?.[0];
  const latestExtraction = latestVersion
    ? await getExtractionForVersion(latestVersion.id)
    : null;

  return (
    <>
      <PageHeader
        title={source.title}
        description={source.description ?? undefined}
        actions={
          source.url ? (
            <Badge variant="outline" className="font-mono text-xs">
              {source.url}
            </Badge>
          ) : undefined
        }
      />

      <Card className="mb-6 border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Fetch from URL</CardTitle>
        </CardHeader>
        <CardContent>
          <FetchSourceButton sourceId={id} defaultUrl={source.url} />
          <p className="mt-3 text-xs text-muted-foreground">
            Trusted domains only. Creates an immutable version snapshot and extraction for
            review. See also{" "}
            <Link href="/acquisition" className="text-primary hover:underline">
              Source Acquisition dashboard
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      {latestExtraction && (
        <div className="mb-6">
          <h2 className="mb-4 font-heading text-lg font-medium">
            Latest extraction (v{latestVersion?.version_number})
          </h2>
          <ExtractionReviewPanel
            extraction={{
              ...latestExtraction,
              acquisition_statuses: (
                latestExtraction as {
                  acquisition_statuses?: { code: string; label: string };
                }
              ).acquisition_statuses,
            }}
          />
        </div>
      )}

      <Card className="mb-6 border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Manual version snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <SourceVersionForm sourceId={id} />
        </CardContent>
      </Card>

      {jobs && jobs.length > 0 && (
        <Card className="mb-6 border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Fetch jobs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {jobs.map((j) => (
              <div key={j.id} className="rounded-md border border-border/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {(j.acquisition_statuses as { label: string })?.label}
                  </Badge>
                  {j.http_status != null && (
                    <span className="text-muted-foreground">HTTP {j.http_status}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(j.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 truncate font-mono text-xs">{j.normalized_url}</p>
                {j.error_message && (
                  <p className="mt-1 text-xs text-destructive">{j.error_message}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Version history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!versions?.length ? (
            <p className="text-sm text-muted-foreground">No versions yet.</p>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className="rounded-md border border-border/50 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">v{v.version_number}</p>
                  {v.snapshot_content_type && (
                    <Badge variant="outline" className="text-xs">
                      {v.snapshot_content_type}
                    </Badge>
                  )}
                  {v.source_fetch_job_id && (
                    <Badge variant="secondary" className="text-xs">
                      fetched
                    </Badge>
                  )}
                </div>
                <pre className="mt-2 max-h-32 overflow-auto font-mono text-xs text-muted-foreground">
                  {(v.raw_snapshot ?? v.content)?.slice(0, 1500) ?? "(empty)"}
                </pre>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
