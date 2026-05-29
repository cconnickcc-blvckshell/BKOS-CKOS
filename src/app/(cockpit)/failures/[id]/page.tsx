import {
  getFailure,
  listFailureCategories,
  listKnowledgeForLink,
  listSeverityLevels,
  listWorkflowsForLink,
} from "@/actions/failures";
import { listEntities, listKnowledgeDomains } from "@/actions/entities";
import { PageHeader } from "@/components/cockpit/page-header";
import { CausesFixesPanel } from "@/components/failures/causes-fixes-panel";
import { FailureLinksPanel } from "@/components/failures/failure-links-panel";
import { FailureRecordForm } from "@/components/failures/failure-record-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { notFound } from "next/navigation";

export default async function FailureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  try {
    data = await getFailure(id);
  } catch {
    notFound();
  }

  const { failure, causes, fixes, workflowLinks, knowledgeLinks } = data;

  const [domains, severities, categories, entities, workflows, knowledgeRecords] =
    await Promise.all([
      listKnowledgeDomains(),
      listSeverityLevels(),
      listFailureCategories(),
      listEntities(
        (failure.knowledge_domains as { code?: string } | null)?.code ?? "comfyui"
      ),
      listWorkflowsForLink(),
      listKnowledgeForLink(),
    ]);

  const domainCode = (failure.knowledge_domains as { code: string })?.code;
  const severityCode = (failure.severity_levels as { code: string })?.code;
  const categoryCode = (failure.failure_categories as { code: string })?.code;

  return (
    <>
      <PageHeader
        title={failure.symptom}
        description={failure.description ?? undefined}
        actions={
          <>
            <Badge variant="secondary">
              {(failure.severity_levels as { label: string })?.label}
            </Badge>
            <Badge variant="outline">
              {(failure.failure_categories as { label: string })?.label}
            </Badge>
            {failure.probability_score != null && (
              <Badge variant="outline">
                P={(failure.probability_score * 100).toFixed(0)}%
              </Badge>
            )}
          </>
        }
      />

      <Card className="mb-6 border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Edit failure</CardTitle>
        </CardHeader>
        <CardContent>
          <FailureRecordForm
            mode="edit"
            failureId={id}
            domains={domains}
            severities={severities}
            categories={categories}
            entities={entities.map((e) => ({
              id: e.id,
              canonical_slug: e.canonical_slug,
              display_name: e.display_name,
            }))}
            initial={{
              domain_code: domainCode,
              symptom: failure.symptom,
              description: failure.description,
              severity_level_code: severityCode,
              category_code: categoryCode,
              entity_id: failure.entity_id,
              probability_score: failure.probability_score,
              detection_signals: failure.detection_signals as Record<string, unknown>,
            }}
          />
        </CardContent>
      </Card>

      <div className="mb-6">
        <CausesFixesPanel failureId={id} causes={causes} fixes={fixes} />
      </div>

      <FailureLinksPanel
        failureId={id}
        workflowLinks={workflowLinks as Parameters<typeof FailureLinksPanel>[0]["workflowLinks"]}
        knowledgeLinks={knowledgeLinks as Parameters<typeof FailureLinksPanel>[0]["knowledgeLinks"]}
        workflows={workflows}
        knowledgeRecords={knowledgeRecords}
      />
    </>
  );
}
