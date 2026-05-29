import { getNormalizationJob } from "@/actions/normalization";
import { PageHeader } from "@/components/cockpit/page-header";
import { NormalizationOutputEditor } from "@/components/normalization/normalization-output-editor";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function NormalizationJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  try {
    data = await getNormalizationJob(id);
  } catch {
    notFound();
  }

  const { job, outputs } = data;
  const domainCode = (job.knowledge_domains as { code: string }).code;
  const extraction = job.source_extraction_results as {
    title: string | null;
    extracted_markdown: string | null;
    source_versions: {
      source_id: string;
      sources: { id: string; title: string };
    };
  };

  const sourceId = extraction.source_versions.sources.id;

  return (
    <>
      <PageHeader
        title="Normalization job"
        description={
          extraction.title ??
          (job.normalization_templates as { label: string }).label
        }
        actions={
          <>
            <Badge variant="secondary">
              {(job.normalization_statuses as { label: string }).label}
            </Badge>
            <Badge variant="outline">
              {(job.normalization_templates as { label: string }).label}
            </Badge>
          </>
        }
      />

      <p className="mb-6 text-sm text-muted-foreground">
        Source:{" "}
        <Link href={`/sources/${sourceId}`} className="text-primary hover:underline">
          {extraction.source_versions.sources.title}
        </Link>
        {" · "}
        Domain: {(job.knowledge_domains as { label: string }).label}
      </p>

      {outputs.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="py-8 text-sm text-muted-foreground">
            No draft outputs on this job.
          </CardContent>
        </Card>
      ) : (
        outputs.map((output) => (
          <div key={output.id} className="mb-6">
            <NormalizationOutputEditor
              output={
                output as Parameters<typeof NormalizationOutputEditor>[0]["output"]
              }
              domainCode={domainCode}
              extractionMarkdown={extraction.extracted_markdown}
            />
          </div>
        ))
      )}

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Extraction reference</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs">
            {extraction.extracted_markdown?.slice(0, 12000) ?? "(no markdown)"}
          </pre>
        </CardContent>
      </Card>
    </>
  );
}
