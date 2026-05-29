"use client";

import { useTransition } from "react";
import { reanalyzeWorkflow } from "@/actions/workflows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

type AnalysisRow = {
  node_count: number;
  custom_node_count: number;
  model_count: number;
  controlnet_count: number;
  lora_count: number;
  video_capable: boolean;
  graph_depth: number;
  branch_count: number;
  complexity_score: number;
  analysis_metadata: Record<string, unknown>;
  complexity_levels: { label: string; code: string } | null;
  workflow_purposes: { label: string; code: string } | null;
  hardware_tiers: { label: string; code: string } | null;
  analyzed_at: string;
  analysis_version: string;
};

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/10 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function WorkflowIntelligencePanel({
  workflowId,
  analysis,
}: {
  workflowId: string;
  analysis: AnalysisRow | null;
}) {
  const [pending, startTransition] = useTransition();

  function handleReanalyze() {
    startTransition(async () => {
      const result = await reanalyzeWorkflow(workflowId);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Workflow re-analyzed");
    });
  }

  if (!analysis) {
    return (
      <Card className="mb-6 border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Workflow intelligence</CardTitle>
          <Button size="sm" variant="outline" onClick={handleReanalyze} disabled={pending}>
            <RefreshCw className={`mr-1 h-4 w-4 ${pending ? "animate-spin" : ""}`} />
            Analyze
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No analysis yet. Run analysis to extract graph metrics and estimates.
          </p>
        </CardContent>
      </Card>
    );
  }

  const meta = analysis.analysis_metadata ?? {};
  const vram = meta.estimated_vram_gb as number | undefined;

  return (
    <Card className="mb-6 border-border/60">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Workflow intelligence</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            v{analysis.analysis_version} · analyzed{" "}
            {new Date(analysis.analyzed_at).toLocaleString()}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleReanalyze} disabled={pending}>
          <RefreshCw className={`mr-1 h-4 w-4 ${pending ? "animate-spin" : ""}`} />
          Re-analyze
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Badge variant="default">
            Purpose: {analysis.workflow_purposes?.label ?? "—"}
          </Badge>
          <Badge variant="secondary">
            Complexity: {analysis.complexity_levels?.label ?? "—"} (
            {analysis.complexity_score})
          </Badge>
          <Badge variant="outline">
            Hardware: {analysis.hardware_tiers?.label ?? "—"}
            {vram != null ? ` · ~${vram}GB VRAM` : ""}
          </Badge>
          {analysis.video_capable && (
            <Badge className="bg-cyan-500/20 text-cyan-300">Video capable</Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <Metric label="Nodes" value={analysis.node_count} />
          <Metric label="Graph depth" value={analysis.graph_depth} />
          <Metric label="Branches" value={analysis.branch_count} />
          <Metric label="Models" value={analysis.model_count} />
          <Metric label="Custom nodes" value={analysis.custom_node_count} />
          <Metric label="ControlNets" value={analysis.controlnet_count} />
          <Metric label="LoRAs" value={analysis.lora_count} />
          <Metric label="Video" value={analysis.video_capable ? "Yes" : "No"} />
        </div>

        {"complexity_breakdown" in meta && meta.complexity_breakdown != null ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Scoring breakdown (JSONB metadata)
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted/30 p-3 font-mono text-xs">
              {JSON.stringify(meta.complexity_breakdown, null, 2)}
            </pre>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
