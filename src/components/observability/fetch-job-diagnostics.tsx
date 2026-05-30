import { getFetchJobDiagnostics } from "@/actions/diagnostics";
import { DiagnosticsPanel } from "@/components/observability/diagnostics-panel";

export async function FetchJobDiagnostics({ jobId }: { jobId: string }) {
  const bundle = await getFetchJobDiagnostics(jobId);
  return <DiagnosticsPanel bundle={bundle} />;
}
