import type { ErrorCodeKey } from "@/lib/observability/error-codes";

export type DiagnosticSection = {
  title: string;
  items: { label: string; value: string; tone?: "default" | "success" | "warning" | "failed" | "skipped" | "retryable" }[];
};

export type DiagnosticBundle = {
  title: string;
  subtitle?: string;
  status: "success" | "warning" | "failed" | "skipped" | "retryable";
  errorCode?: ErrorCodeKey;
  userMessage?: string;
  recommendedNextStep?: string;
  likelyCauses?: string[];
  recommendedFixes?: string[];
  sections: DiagnosticSection[];
  rawMetadata?: Record<string, unknown>;
};

export function formatDiagnosticSummary(bundle: DiagnosticBundle): string {
  const lines: string[] = [
    `# ${bundle.title}`,
    bundle.subtitle ? bundle.subtitle : "",
    `Status: ${bundle.status}`,
  ];
  if (bundle.errorCode) lines.push(`Error code: ${bundle.errorCode}`);
  if (bundle.userMessage) lines.push(`Message: ${bundle.userMessage}`);
  if (bundle.recommendedNextStep) {
    lines.push(`Next step: ${bundle.recommendedNextStep}`);
  }
  if (bundle.likelyCauses?.length) {
    lines.push("", "Likely causes:");
    bundle.likelyCauses.forEach((c) => lines.push(`- ${c}`));
  }
  if (bundle.recommendedFixes?.length) {
    lines.push("", "Recommended fixes:");
    bundle.recommendedFixes.forEach((f) => lines.push(`- ${f}`));
  }
  for (const section of bundle.sections) {
    lines.push("", `## ${section.title}`);
    for (const item of section.items) {
      lines.push(`${item.label}: ${item.value}`);
    }
  }
  return lines.filter(Boolean).join("\n");
}
