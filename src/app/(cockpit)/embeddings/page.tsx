import { listEmbeddingJobs, listEmbeddingModelConfigs } from "@/actions/embeddings";
import { PageHeader } from "@/components/cockpit/page-header";
import { EmbeddingAdminActions } from "@/components/embeddings/embedding-admin-actions";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function EmbeddingsDashboardPage() {
  const [jobs, configs] = await Promise.all([
    listEmbeddingJobs(),
    listEmbeddingModelConfigs(),
  ]);

  const activeConfig = configs.find((c) => c.is_active);

  return (
    <>
      <PageHeader
        title="Embedding Jobs"
        description="Idempotent embedding queue for knowledge, workflows, failures, recipes, and source extractions"
      />

      <div className="mb-6 rounded-lg border border-border/60 p-4">
        <h2 className="mb-2 text-sm font-medium">Active model</h2>
        {activeConfig ? (
          <p className="text-sm text-muted-foreground">
            <Badge variant="secondary" className="mr-2">
              {activeConfig.provider}
            </Badge>
            {activeConfig.model} · {activeConfig.dimensions} dimensions
          </p>
        ) : (
          <p className="text-sm text-destructive">No active embedding model configured.</p>
        )}
      </div>

      <div className="mb-8">
        <EmbeddingAdminActions />
      </div>

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Hash</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No embedding jobs yet. Approve knowledge or fetch sources to enqueue work.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((j) => {
                const st = j.embedding_statuses as { label: string; code: string };
                return (
                  <TableRow key={j.id}>
                    <TableCell>
                      <span className="font-mono text-xs">{j.entity_type}</span>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                        {j.entity_id}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          st?.code === "failed"
                            ? "destructive"
                            : st?.code === "succeeded"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {st?.label}
                      </Badge>
                      {j.error_message && (
                        <p className="mt-1 text-xs text-destructive">{j.error_message}</p>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">
                      {j.content_hash?.slice(0, 12)}…
                    </TableCell>
                    <TableCell>{j.token_estimate ?? "—"}</TableCell>
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
