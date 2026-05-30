import { getDecisionDiagnostics } from "@/actions/diagnostics";
import { DiagnosticsPanel } from "@/components/observability/diagnostics-panel";

export async function DecisionDiagnostics({ requestId }: { requestId: string }) {
  const bundle = await getDecisionDiagnostics(requestId);
  return <DiagnosticsPanel bundle={bundle} />;
}
