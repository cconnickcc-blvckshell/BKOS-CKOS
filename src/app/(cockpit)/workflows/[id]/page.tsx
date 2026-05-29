import { getWorkflow } from "@/actions/workflows";
import { PageHeader } from "@/components/cockpit/page-header";
import { WorkflowIntelligencePanel } from "@/components/workflows/workflow-intelligence-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notFound } from "next/navigation";

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  try {
    data = await getWorkflow(id);
  } catch {
    notFound();
  }

  const { workflow, nodes, analysis } = data;

  return (
    <>
      <PageHeader
        title={workflow.title}
        description={workflow.description ?? undefined}
        actions={
          workflow.workflow_categories ? (
            <Badge>
              {(workflow.workflow_categories as { label: string }).label}
            </Badge>
          ) : undefined
        }
      />

      <WorkflowIntelligencePanel
        workflowId={id}
        analysis={
          analysis as Parameters<typeof WorkflowIntelligencePanel>[0]["analysis"]
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">
              Extracted nodes ({nodes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Class</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodes.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-mono text-xs">{n.node_key}</TableCell>
                    <TableCell>{n.class_type}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Workflow JSON</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[500px] overflow-auto rounded-md bg-muted/30 p-4 font-mono text-xs">
              {JSON.stringify(workflow.workflow_json, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
