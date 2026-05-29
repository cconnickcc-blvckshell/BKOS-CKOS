import {
  listKnowledgeRecords,
  listKnowledgeTypes,
  listRelationshipTypes,
} from "@/actions/knowledge";
import { PageHeader } from "@/components/cockpit/page-header";
import { CreateKnowledgeDialog } from "@/components/forms/create-knowledge-dialog";
import { CreateRelationshipDialog } from "@/components/forms/create-relationship-dialog";
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

export default async function KnowledgePage() {
  const [records, types, relationshipTypes] = await Promise.all([
    listKnowledgeRecords(),
    listKnowledgeTypes(),
    listRelationshipTypes(),
  ]);

  return (
    <>
      <PageHeader
        title="Knowledge Explorer"
        description="Structured, normalized knowledge records — nodes, models, techniques, and more"
        actions={
          <>
            <CreateRelationshipDialog
              records={records.map((r) => ({ id: r.id, title: r.title }))}
              relationshipTypes={relationshipTypes}
            />
            <CreateKnowledgeDialog types={types} />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {types.map((t) => (
          <Badge key={t.id} variant="outline">
            {t.label}
          </Badge>
        ))}
      </div>

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Confidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No knowledge records. Create your first structured record.
                </TableCell>
              </TableRow>
            ) : (
              records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      href={`/knowledge/${r.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {r.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {(r.knowledge_types as { label?: string })?.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">
                    {r.summary ?? "—"}
                  </TableCell>
                  <TableCell>
                    {r.confidence != null
                      ? `${(r.confidence * 100).toFixed(0)}%`
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
