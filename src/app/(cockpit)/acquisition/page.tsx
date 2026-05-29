import { listFetchJobs, listTrustedDomains } from "@/actions/acquisition";
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

export default async function AcquisitionDashboardPage() {
  const [jobs, domains] = await Promise.all([listFetchJobs(), listTrustedDomains()]);

  return (
    <>
      <PageHeader
        title="Source Acquisition"
        description="User-submitted URL fetches from trusted domains — raw snapshots and extracted content for review before normalization"
        actions={
          <Button size="sm" render={<Link href="/acquisition/new" />}>
            Add URL and fetch
          </Button>
        }
      />

      <div className="mb-8 rounded-lg border border-border/60 p-4">
        <h2 className="mb-2 text-sm font-medium">Trusted domains</h2>
        <div className="flex flex-wrap gap-2">
          {domains.map((d) => (
            <Badge key={d.id} variant={d.is_active ? "outline" : "secondary"}>
              {d.domain}
            </Badge>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          No blind or recursive crawling — single-page fetch only. Robots.txt is respected.
        </p>
      </div>

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>HTTP</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No fetch jobs yet. Add a trusted URL to begin acquisition.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((j) => {
                const src = j.sources as { id: string; title: string } | null;
                const st = j.acquisition_statuses as { label: string; code: string } | null;
                return (
                  <TableRow key={j.id}>
                    <TableCell>
                      {src ? (
                        <Link
                          href={`/sources/${src.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {src.title}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground">
                      {j.normalized_url}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={st?.code === "failed" ? "destructive" : "secondary"}
                      >
                        {st?.label ?? "—"}
                      </Badge>
                      {j.error_message && (
                        <p className="mt-1 text-xs text-destructive">{j.error_message}</p>
                      )}
                    </TableCell>
                    <TableCell>{j.http_status ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(j.created_at).toLocaleString()}
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
