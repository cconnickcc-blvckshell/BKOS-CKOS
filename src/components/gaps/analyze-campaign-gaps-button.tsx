"use client";

import { useState } from "react";
import { runCampaignGapAnalysis } from "@/actions/gaps";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Search } from "lucide-react";

export function AnalyzeCampaignGapsButton({ campaignId }: { campaignId: string }) {
  const [pending, setPending] = useState(false);

  async function handleAnalyze() {
    setPending(true);
    const result = await runCampaignGapAnalysis(campaignId);
    setPending(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    if ("ok" in result && result.ok) {
      toast.success(
        `Detected ${result.detected} gap(s): ${result.created} new, ${result.updated} updated`
      );
      window.location.reload();
    }
  }

  return (
    <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={handleAnalyze}>
      <Search className="mr-2 size-4" />
      {pending ? "Analyzing…" : "Analyze gaps"}
    </Button>
  );
}
