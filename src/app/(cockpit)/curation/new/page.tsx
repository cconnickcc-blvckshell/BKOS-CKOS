import { listCurationCampaignStatuses } from "@/actions/curation";
import { listKnowledgeDomains } from "@/actions/entities";
import { listNormalizationTemplates } from "@/actions/normalization";
import { PageHeader } from "@/components/cockpit/page-header";
import { CampaignForm } from "@/components/curation/campaign-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewCurationCampaignPage() {
  const [domains, statuses, templates] = await Promise.all([
    listKnowledgeDomains(),
    listCurationCampaignStatuses(),
    listNormalizationTemplates(),
  ]);

  return (
    <>
      <PageHeader
        title="New curation campaign"
        description="Define a topic and domain, then add trusted URLs to build reviewed knowledge"
      />

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Campaign details</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignForm
            mode="create"
            domains={domains.map((d) => ({ code: d.code, label: d.label }))}
            statuses={statuses.map((s) => ({ code: s.code, label: s.label }))}
            templates={templates.map((t) => ({ code: t.code, label: t.label }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
