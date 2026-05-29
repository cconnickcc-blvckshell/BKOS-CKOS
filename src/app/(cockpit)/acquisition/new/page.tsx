import { listSourceTypes } from "@/actions/sources";
import { PageHeader } from "@/components/cockpit/page-header";
import { AddUrlFetchForm } from "@/components/acquisition/add-url-fetch-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AcquisitionNewPage() {
  const types = await listSourceTypes();

  return (
    <>
      <PageHeader
        title="Add URL and fetch"
        description="Paste a URL from a trusted domain — CKOS will fetch, snapshot, and extract readable content for review"
      />

      <Card className="max-w-lg border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Acquisition request</CardTitle>
        </CardHeader>
        <CardContent>
          <AddUrlFetchForm types={types} />
        </CardContent>
      </Card>
    </>
  );
}
