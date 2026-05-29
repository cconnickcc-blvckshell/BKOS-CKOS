import {
  listFailureCategories,
  listSeverityLevels,
} from "@/actions/failures";
import { listEntities, listKnowledgeDomains } from "@/actions/entities";
import { PageHeader } from "@/components/cockpit/page-header";
import { FailureRecordForm } from "@/components/failures/failure-record-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewFailurePage() {
  const [domains, severities, categories, entities] = await Promise.all([
    listKnowledgeDomains(),
    listSeverityLevels(),
    listFailureCategories(),
    listEntities("comfyui"),
  ]);

  return (
    <>
      <PageHeader
        title="New failure record"
        description="Manually document a known generation failure — domain-aware, optionally linked to a canonical entity"
      />

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Failure details</CardTitle>
        </CardHeader>
        <CardContent>
          <FailureRecordForm
            mode="create"
            domains={domains}
            severities={severities}
            categories={categories}
            entities={entities.map((e) => ({
              id: e.id,
              canonical_slug: e.canonical_slug,
              display_name: e.display_name,
            }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
