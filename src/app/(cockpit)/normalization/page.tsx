import { listNormalizationJobs } from "@/actions/normalization";
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

export default async function NormalizationQueuePage() {
  const jobs = await listNormalizationJobs();

  return (
    <>
      <PageHeader
        title="Normalization Queue"
        description="Human-reviewed pipeline from source extractions to published knowledge records"
        actions={
          <Button size="sm" variant="outline" render={<Link href="/acquisition" />}>
            From acquisition
          </Button>
        }
      />

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No normalization jobs yet. Fetch a source, then create a job from its
                  extraction on the source detail page.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((j) => {
                const ext = j.source_extraction_results as {
                  title: string | null;
                } | null;
                return (
                  <TableRow key={j.id}>
                    <TableCell>
                      <Link
                        href={`/normalization/${j.id}`}
                        className="font-medium hover:text-primary"
                      >
                        {ext?.title ?? "Extraction draft"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {(j.normalization_templates as { label: string })?.label}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(j.knowledge_domains as { label: string })?.label}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {(j.normalization_statuses as { label: string })?.label}
                      </Badge>
                    </TableCell>
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
