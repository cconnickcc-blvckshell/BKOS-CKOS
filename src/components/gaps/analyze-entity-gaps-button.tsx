"use client";

import { useState } from "react";
import { runEntityGapAnalysis } from "@/actions/gaps";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function AnalyzeEntityGapsButton({ entityId }: { entityId: string }) {
  const [pending, setPending] = useState(false);

  async function handleAnalyze() {
    setPending(true);
    const result = await runEntityGapAnalysis(entityId);
    setPending(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    if ("ok" in result && result.ok) {
      toast.success(`Detected ${result.detected} gap(s), ${result.created} new`);
      window.location.reload();
    }
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={handleAnalyze}>
      {pending ? "Analyzing…" : "Analyze gaps"}
    </Button>
  );
}
