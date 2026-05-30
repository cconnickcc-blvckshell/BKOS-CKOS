import { getNormalizationDiagnostics } from "@/actions/diagnostics";
import { DiagnosticsPanel } from "@/components/observability/diagnostics-panel";

export async function NormalizationDiagnostics({ jobId }: { jobId: string }) {
  const bundle = await getNormalizationDiagnostics(jobId);
  return <DiagnosticsPanel bundle={bundle} />;
}
