import {
  getCurationCampaign,
  listCurationCampaignStatuses,
} from "@/actions/curation";
import { listKnowledgeDomains } from "@/actions/entities";
import { listNormalizationTemplates } from "@/actions/normalization";
import { PageHeader } from "@/components/cockpit/page-header";
import { CampaignForm } from "@/components/curation/campaign-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function EditCurationCampaignPage({
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

  const [domains, statuses, templates] = await Promise.all([
    listKnowledgeDomains(),
    listCurationCampaignStatuses(),
    listNormalizationTemplates(),
  ]);

  const campaign = {
    ...data.campaign,
    curation_campaign_statuses: data.campaign.curation_campaign_statuses as {
      code: string;
    },
    knowledge_domains: data.campaign.knowledge_domains as { code: string },
    metadata: data.campaign.metadata as Record<string, unknown>,
  };

  return (
    <>
      <PageHeader
        title="Edit campaign"
        description={campaign.title}
        actions={
          <Link href={`/curation/${id}`} className="text-sm text-primary hover:underline">
            ← Back to campaign
          </Link>
        }
      />

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Campaign details</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignForm
            mode="edit"
            campaign={campaign}
            domains={domains.map((d) => ({ code: d.code, label: d.label }))}
            statuses={statuses.map((s) => ({ code: s.code, label: s.label }))}
            templates={templates.map((t) => ({ code: t.code, label: t.label }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
