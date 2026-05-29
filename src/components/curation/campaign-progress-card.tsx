import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CampaignProgressMetrics } from "@/lib/curation/campaign-metrics";

export function CampaignProgressCard({ metrics }: { metrics: CampaignProgressMetrics }) {
  const rows = [
    { label: "Total URLs", value: metrics.totalSources },
    { label: "Pending fetch", value: metrics.pendingFetch },
    { label: "Fetched", value: metrics.fetched },
    { label: "Fetch failed", value: metrics.fetchFailed },
    { label: "Extraction ready", value: metrics.extractionReady },
    { label: "Normalization ready", value: metrics.normalizationReady },
    { label: "Approved knowledge", value: metrics.approved },
    { label: "Embedded", value: metrics.embedded },
  ];

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Campaign progress</CardTitle>
        <p className="text-2xl font-semibold">{metrics.percentComplete}%</p>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {rows.map((r) => (
            <div key={r.label}>
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="font-medium">{r.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Normalization outputs still require human approval before they become knowledge
          records. Campaigns organize work; they do not bypass review.
        </p>
      </CardContent>
    </Card>
  );
}
