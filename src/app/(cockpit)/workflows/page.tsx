import { listWorkflows, listWorkflowCategories } from "@/actions/workflows";
import { PageHeader } from "@/components/cockpit/page-header";
import { CreateWorkflowDialog } from "@/components/forms/create-workflow-dialog";
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

export default async function WorkflowsPage() {
  const [workflows, categories] = await Promise.all([
    listWorkflows(),
    listWorkflowCategories(),
  ]);

  return (
    <>
      <PageHeader
        title="Workflow Explorer"
        description="ComfyUI workflow JSON ingestion, node extraction, and dependency analysis"
        actions={<CreateWorkflowDialog categories={categories} />}
      />

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Nodes</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workflows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No workflows ingested. Paste ComfyUI API JSON to begin.
                </TableCell>
              </TableRow>
            ) : (
              workflows.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <Link
                      href={`/workflows/${w.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {w.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {(w.workflow_categories as { label?: string })?.label ? (
                      <Badge variant="outline">
                        {(w.workflow_categories as { label: string }).label}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{w.node_count ?? "—"}</TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">
                    {w.description ?? "—"}
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
