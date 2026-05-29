import { listKnowledgeGaps, listGapStatuses } from "@/actions/gaps";
import { PageHeader } from "@/components/cockpit/page-header";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function KnowledgeGapsPage() {
  const [gaps, statuses] = await Promise.all([listKnowledgeGaps(), listGapStatuses()]);

  const openCount = gaps.filter(
    (g) => (g.gap_statuses as { code: string })?.code === "open"
  ).length;

  return (
    <>
      <PageHeader
        title="Knowledge Gaps"
        description="Evidence-backed coverage gaps across campaigns, entities, and CKOS records"
      />

      <p className="mb-6 text-sm text-muted-foreground">
        {gaps.length} total · {openCount} open · Statuses:{" "}
        {statuses.map((s) => s.label).join(", ")}
      </p>

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Gap</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gaps.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No gaps yet. Run Analyze gaps on a curation campaign or entity.
                </TableCell>
              </TableRow>
            ) : (
              gaps.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>
                    <Link href={`/gaps/${g.id}`} className="font-medium hover:text-primary">
                      {g.title}
                    </Link>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {g.description}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {(g.gap_types as { label: string })?.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        (g.gap_severity_levels as { code: string })?.code === "critical"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {(g.gap_severity_levels as { label: string })?.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(g.gap_statuses as { label: string })?.label}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {g.detection_source}
                    {(g.curation_campaigns as { title: string } | null) && (
                      <span className="block">
                        {(g.curation_campaigns as { title: string }).title}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
