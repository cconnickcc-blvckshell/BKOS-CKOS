import { listKnowledgeGapsForCampaign } from "@/actions/gaps";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export async function CampaignGapsPanel({ campaignId }: { campaignId: string }) {
  const gaps = await listKnowledgeGapsForCampaign(campaignId);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Knowledge gaps ({gaps.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {gaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No gaps recorded. Click Analyze gaps to run evidence-backed detection.
          </p>
        ) : (
          <ul className="space-y-2">
            {gaps.map((g) => {
              const type = g.gap_types as { label: string; code: string };
              const status = g.gap_statuses as { label: string; code: string };
              const severity = g.gap_severity_levels as { label: string; code: string };
              return (
                <li key={g.id} className="rounded-md border border-border/50 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/gaps/${g.id}`} className="font-medium hover:text-primary">
                      {g.title}
                    </Link>
                    <Badge variant="outline">{type?.label}</Badge>
                    <Badge variant="secondary">{status?.label}</Badge>
                    <Badge
                      variant={
                        severity?.code === "critical" || severity?.code === "high"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {severity?.label}
                    </Badge>
                  </div>
                  {g.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {g.description}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          <Link href="/gaps" className="hover:text-primary">
            View all gaps →
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
