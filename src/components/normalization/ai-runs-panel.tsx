import { listAiRunsForJob } from "@/actions/normalization-ai";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function AiRunsPanel({ jobId }: { jobId: string }) {
  const runs = await listAiRunsForJob(jobId);

  if (runs.length === 0) {
    return (
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">AI runs</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No AI draft runs yet. Use Generate AI Drafts to propose outputs from the
          extraction (human review required before publish).
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">AI runs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {runs.map((run) => {
          const status = run.normalization_statuses as { label: string; code: string } | null;
          const prompt = run.prompt_templates as { label: string; code: string } | null;
          const provider = run.ai_provider_configs as { provider: string; model: string } | null;

          return (
            <div
              key={run.id}
              className="rounded-md border border-border/50 p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{status?.label ?? "Unknown"}</Badge>
                <span className="text-muted-foreground">
                  {prompt?.label ?? "Prompt"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {provider?.provider}/{provider?.model} · {run.parsed_output_count}{" "}
                proposal{run.parsed_output_count === 1 ? "" : "s"} ·{" "}
                {new Date(run.created_at).toLocaleString()}
              </p>
              {run.error_message && (
                <p className="mt-2 text-xs text-destructive">{run.error_message}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
