import { listSources, listSourceTypes } from "@/actions/sources";
import { PageHeader } from "@/components/cockpit/page-header";
import { CreateSourceDialog } from "@/components/forms/create-source-dialog";
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

export default async function SourcesPage() {
  const [sources, types] = await Promise.all([listSources(), listSourceTypes()]);

  return (
    <>
      <PageHeader
        title="Source Explorer"
        description="Track documentation, repos, wikis, and transcripts with version history"
        actions={
          <>
            <Button size="sm" variant="outline" render={<Link href="/acquisition/new" />}>
              Add URL & fetch
            </Button>
            <CreateSourceDialog types={types} />
          </>
        }
      />

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Confidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No sources registered yet.
                </TableCell>
              </TableRow>
            ) : (
              sources.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      href={`/sources/${s.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {s.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {(s.source_types as { label?: string })?.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary"
                      >
                        {s.url}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {s.confidence != null
                      ? `${(s.confidence * 100).toFixed(0)}%`
                      : "—"}
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
