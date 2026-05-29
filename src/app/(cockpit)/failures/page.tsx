import { listFailures } from "@/actions/failures";
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

export default async function FailuresPage() {
  const failures = await listFailures();

  return (
    <>
      <PageHeader
        title="Failure Explorer"
        description="Structured failure intelligence — symptoms, causes, fixes, and cross-links"
        actions={
          <Button size="sm" render={<Link href="/failures/new" />}>
            New failure
          </Button>
        }
      />

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symptom</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Causes</TableHead>
              <TableHead>Fixes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {failures.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No failures yet. Run migrations for seed data or create one.
                </TableCell>
              </TableRow>
            ) : (
              failures.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <Link
                      href={`/failures/${f.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {f.symptom}
                    </Link>
                    {f.entities && (
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {(f.entities as { canonical_slug: string }).canonical_slug}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {(f.severity_levels as { label?: string })?.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {(f.failure_categories as { label?: string })?.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {(f.knowledge_domains as { label?: string })?.label ?? "—"}
                  </TableCell>
                  <TableCell>{f.cause_count}</TableCell>
                  <TableCell>{f.fix_count}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
