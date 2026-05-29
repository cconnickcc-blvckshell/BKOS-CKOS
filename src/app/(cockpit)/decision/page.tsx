import { listDecisionRequests } from "@/actions/decision";
import { PageHeader } from "@/components/cockpit/page-header";
import { Button } from "@/components/ui/button";
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

export default async function DecisionEnginePage() {
  const requests = await listDecisionRequests();

  return (
    <>
      <PageHeader
        title="Decision Engine"
        description="Goal + constraints → retrieval-first recommendations from approved CKOS knowledge, workflows, failures, and recipes"
        actions={
          <Button size="sm" render={<Link href="/decision/new" />}>
            New decision request
          </Button>
        }
      />

      <p className="mb-6 text-sm text-muted-foreground">
        Recommendations cite only existing CKOS records. Nothing runs automatically — review
        citations and warnings before acting.
      </p>

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Goal</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No decision requests yet. Create one to get a reviewable recommendation.
                </TableCell>
              </TableRow>
            ) : (
              requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-md">
                    <Link
                      href={`/decision/${r.id}`}
                      className="font-medium hover:text-primary line-clamp-2"
                    >
                      {r.goal_text}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {(r.decision_goal_types as { label: string })?.label}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {(r.decision_statuses as { label: string })?.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
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
