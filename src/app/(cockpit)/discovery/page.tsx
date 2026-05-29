import { listDiscoverySuggestions, listDiscoveryStatuses } from "@/actions/discovery";
import { PageHeader } from "@/components/cockpit/page-header";
import { DiscoverySuggestionActions } from "@/components/discovery/discovery-suggestion-actions";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";

export default async function DiscoveryPage() {
  const [suggestions, statuses] = await Promise.all([
    listDiscoverySuggestions(),
    listDiscoveryStatuses(),
  ]);

  const proposed = suggestions.filter(
    (s) => (s.discovery_statuses as { code: string }).code === "proposed"
  ).length;

  return (
    <>
      <PageHeader
        title="Source discovery"
        description="Reviewable trusted URL suggestions from knowledge gaps — approve before adding to campaigns (no auto-fetch)"
      />

      <p className="mb-6 text-sm text-muted-foreground">
        {suggestions.length} suggestion(s) · {proposed} awaiting review · Statuses:{" "}
        {statuses.map((s) => s.label).join(", ")}
      </p>

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Suggestion</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Gap / Campaign</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suggestions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No discovery suggestions. Analyze gaps on a campaign, then suggest sources.
                </TableCell>
              </TableRow>
            ) : (
              suggestions.map((s) => {
                const status = s.discovery_statuses as { code: string; label: string };
                const src = s.discovery_suggestion_sources as { label: string };
                const gap = s.knowledge_gaps as { id: string; title: string } | null;
                const campaign = s.curation_campaigns as { id: string; title: string } | null;

                return (
                  <TableRow key={s.id}>
                    <TableCell className="max-w-xs">
                      <a
                        href={s.suggested_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary hover:underline line-clamp-2"
                      >
                        {s.title ?? s.normalized_url}
                      </a>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {s.reason}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs">{src?.label}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{status?.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {gap && (
                        <Link href={`/gaps/${gap.id}`} className="hover:text-primary">
                          {gap.title}
                        </Link>
                      )}
                      {campaign && (
                        <span className="block text-muted-foreground">{campaign.title}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DiscoverySuggestionActions
                        suggestionId={s.id}
                        statusCode={status?.code ?? "proposed"}
                        hasCampaign={Boolean(s.campaign_id)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
