import { getNormalizationJob } from "@/actions/normalization";
import { getAiDraftAvailability } from "@/actions/normalization-ai";
import { PageHeader } from "@/components/cockpit/page-header";
import { AiRunsPanel } from "@/components/normalization/ai-runs-panel";
import { GenerateAiDraftsButton } from "@/components/normalization/generate-ai-drafts-button";
import { NormalizationOutputEditor } from "@/components/normalization/normalization-output-editor";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

type JobOutput = {
  id: string;
  is_ai_proposal?: boolean;
  [key: string]: unknown;
};

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
  const aiAvailability = await getAiDraftAvailability();
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
  const manualOutputs = (outputs as JobOutput[]).filter((o) => !o.is_ai_proposal);
  const aiOutputs = (outputs as JobOutput[]).filter((o) => o.is_ai_proposal);

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
            <GenerateAiDraftsButton
              jobId={id}
              aiEnabled={aiAvailability.enabled}
              disabledMessage={aiAvailability.message}
            />
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
        {" · "}
        AI proposals are untrusted drafts — approve only after verifying source quotes.
      </p>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              Manual draft
            </h2>
            {manualOutputs.length === 0 ? (
              <Card className="border-border/60">
                <CardContent className="py-6 text-sm text-muted-foreground">
                  No manual draft output on this job.
                </CardContent>
              </Card>
            ) : (
              manualOutputs.map((output) => (
                <div key={output.id} className="mb-4">
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
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              AI proposals ({aiOutputs.length})
            </h2>
            {aiOutputs.length === 0 ? (
              <Card className="border-border/60">
                <CardContent className="py-6 text-sm text-muted-foreground">
                  No AI proposals yet. Configure an AI provider (Ollama, LM Studio, or
                  OpenAI-compatible) or use manual drafts above. With AI_PROVIDER=disabled,
                  only manual normalization is available.
                </CardContent>
              </Card>
            ) : (
              aiOutputs.map((output) => (
                <div key={output.id} className="mb-4">
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
          </section>
        </div>

        <aside className="space-y-6">
          <AiRunsPanel jobId={id} />
        </aside>
      </div>

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
