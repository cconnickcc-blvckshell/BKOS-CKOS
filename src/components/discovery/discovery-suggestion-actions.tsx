"use client";

import { useState } from "react";
import {
  addApprovedSuggestionToCampaign,
  approveDiscoverySuggestion,
  dismissDiscoverySuggestion,
  rejectDiscoverySuggestion,
} from "@/actions/discovery";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function DiscoverySuggestionActions({
  suggestionId,
  statusCode,
  hasCampaign,
}: {
  suggestionId: string;
  statusCode: string;
  hasCampaign: boolean;
}) {
  const [pending, setPending] = useState(false);
  const finalized =
    statusCode === "rejected" ||
    statusCode === "dismissed" ||
    statusCode === "added_to_campaign";

  async function run(
    action: "approve" | "reject" | "dismiss" | "add"
  ) {
    setPending(true);
    let result;
    if (action === "approve") result = await approveDiscoverySuggestion(suggestionId);
    else if (action === "reject") result = await rejectDiscoverySuggestion(suggestionId);
    else if (action === "dismiss") result = await dismissDiscoverySuggestion(suggestionId);
    else result = await addApprovedSuggestionToCampaign(suggestionId);

    setPending(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    if (action === "add") toast.success("Added to campaign (not fetched — fetch manually when ready)");
    else toast.success(`Suggestion ${action === "approve" ? "approved" : action + "ed"}`);
    window.location.reload();
  }

  if (finalized) {
    return (
      <span className="text-xs text-muted-foreground">
        {statusCode === "added_to_campaign"
          ? "Already added to campaign"
          : `Status: ${statusCode}`}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {statusCode === "proposed" && (
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run("approve")}
          >
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run("reject")}
          >
            Reject
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run("dismiss")}
          >
            Dismiss
          </Button>
        </>
      )}
      {statusCode === "approved" && hasCampaign && (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => run("add")}
        >
          Add to campaign
        </Button>
      )}
    </div>
  );
}
