"use client";

import { useState } from "react";
import {
  runCampaignSourceSuggestions,
  runGapSourceSuggestions,
} from "@/actions/discovery";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Lightbulb } from "lucide-react";

export function SuggestSourcesForGapButton({ gapId }: { gapId: string }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const result = await runGapSourceSuggestions(gapId);
    setPending(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    if ("ok" in result && result.ok) {
      toast.success(
        `Suggested ${result.detected} target(s): ${result.created} new, ${result.updated} updated`
      );
      window.location.reload();
    }
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={handleClick}>
      <Lightbulb className="mr-2 size-4" />
      {pending ? "Suggesting…" : "Suggest sources"}
    </Button>
  );
}

export function SuggestSourcesForCampaignButton({ campaignId }: { campaignId: string }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const result = await runCampaignSourceSuggestions(campaignId);
    setPending(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    if ("ok" in result && result.ok) {
      toast.success(
        `Processed ${result.gapsProcessed} gap(s): ${result.created} new suggestions`
      );
      window.location.reload();
    }
  }

  return (
    <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={handleClick}>
      <Lightbulb className="mr-2 size-4" />
      {pending ? "Suggesting…" : "Suggest sources for gaps"}
    </Button>
  );
}
