"use client";

import { useState } from "react";
import { StatusBadge, type ObservabilityStatus } from "@/components/observability/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DiagnosticBundle } from "@/lib/observability/diagnostics";
import { toast } from "sonner";
import { Copy, ChevronDown, ChevronUp } from "lucide-react";

export function DiagnosticsPanel({
  bundle,
  defaultOpen = false,
}: {
  bundle: DiagnosticBundle;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  async function copySummary() {
    const { copyDiagnosticSummary } = await import("@/actions/diagnostics");
    const text = await copyDiagnosticSummary(bundle);
    await navigator.clipboard.writeText(text);
    toast.success("Diagnostic summary copied");
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base">Diagnostics</CardTitle>
          <p className="text-xs text-muted-foreground">{bundle.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={bundle.status} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4 text-sm">
          {bundle.errorCode && (
            <p className="font-mono text-xs text-muted-foreground">
              {bundle.errorCode}
            </p>
          )}
          {bundle.userMessage && (
            <p className="text-foreground">{bundle.userMessage}</p>
          )}
          {bundle.recommendedFixes && bundle.recommendedFixes.length > 0 && (
            <div>
              <p className="mb-1 font-medium text-muted-foreground">Recommended fixes</p>
              <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                {bundle.recommendedFixes.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {bundle.sections.map((section) => (
            <div key={section.title}>
              <p className="mb-2 font-medium">{section.title}</p>
              <dl className="grid gap-1 sm:grid-cols-2">
                {section.items.map((item) => (
                  <div key={`${section.title}-${item.label}`} className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">{item.label}:</dt>
                    <dd className="flex items-center gap-2 break-all">
                      {item.tone && item.tone !== "default" ? (
                        <StatusBadge
                          status={item.tone as ObservabilityStatus}
                          label={item.value}
                          className="font-normal"
                        />
                      ) : (
                        item.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={copySummary}>
            <Copy className="mr-2 h-4 w-4" />
            Copy diagnostic summary
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
