"use client";

import { useState } from "react";
import {
  createCampaignNormalizationJobs,
  fetchCampaignPendingUrls,
  processCampaignEmbeddings,
} from "@/actions/curation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, ListChecks, Sparkles } from "lucide-react";

export function CampaignBatchActions({ campaignId }: { campaignId: string }) {
  const [pending, setPending] = useState<string | null>(null);

  async function run(action: "fetch" | "normalize" | "embed") {
    setPending(action);
    let result;

    if (action === "fetch") {
      result = await fetchCampaignPendingUrls(campaignId);
    } else if (action === "normalize") {
      result = await createCampaignNormalizationJobs(campaignId);
    } else {
      result = await processCampaignEmbeddings(campaignId);
    }

    setPending(null);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    if (action === "fetch" && "fetched" in result) {
      toast.success(`Fetched ${result.fetched}, failed ${result.failed ?? 0}`);
    } else if (action === "normalize" && "created" in result) {
      toast.success(`Created ${result.created} normalization job(s)`);
      if (result.errors?.length) {
        toast.message(result.errors.join("; "));
      }
    } else if (action === "embed" && "processed" in result) {
      toast.success(
        `Embeddings: ${result.processed} processed, ${result.skipped ?? 0} skipped`
      );
    }

    window.location.reload();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending !== null}
        onClick={() => run("fetch")}
      >
        <Download className="mr-2 size-4" />
        {pending === "fetch" ? "Fetching…" : "Fetch all pending URLs"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending !== null}
        onClick={() => run("normalize")}
      >
        <ListChecks className="mr-2 size-4" />
        {pending === "normalize" ? "Creating jobs…" : "Create normalization jobs"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending !== null}
        onClick={() => run("embed")}
      >
        <Sparkles className="mr-2 size-4" />
        {pending === "embed" ? "Processing…" : "Process embeddings"}
      </Button>
    </div>
  );
}
