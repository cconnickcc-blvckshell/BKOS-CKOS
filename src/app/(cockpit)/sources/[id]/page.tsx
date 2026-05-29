import { getSource } from "@/actions/sources";
import { PageHeader } from "@/components/cockpit/page-header";
import { SourceVersionForm } from "@/components/forms/source-version-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
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
  const { data: versions } = await supabase
    .from("source_versions")
    .select("*")
    .eq("source_id", id)
    .order("version_number", { ascending: false });

  return (
    <>
      <PageHeader
        title={source.title}
        description={source.description ?? undefined}
      />

      <Card className="mb-6 border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Add version snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <SourceVersionForm sourceId={id} />
        </CardContent>
      </Card>

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
                <p className="text-sm font-medium">v{v.version_number}</p>
                <pre className="mt-2 max-h-48 overflow-auto font-mono text-xs text-muted-foreground">
                  {v.content?.slice(0, 2000) ?? "(empty)"}
                </pre>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
