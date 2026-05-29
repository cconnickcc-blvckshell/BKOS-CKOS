"use client";

import { useState } from "react";
import { rebuildDecisionRecommendation } from "@/actions/decision";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function RebuildRecommendationButton({ requestId }: { requestId: string }) {
  const [pending, setPending] = useState(false);

  async function handleRebuild() {
    setPending(true);
    const result = await rebuildDecisionRecommendation(requestId);
    setPending(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Recommendation rebuilt from CKOS");
    window.location.reload();
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={handleRebuild}>
      {pending ? "Rebuilding…" : "Rebuild recommendation"}
    </Button>
  );
}
