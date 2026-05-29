"use client";

import { useState } from "react";
import { generateAiDraftsForJob } from "@/actions/normalization-ai";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export function GenerateAiDraftsButton({
  jobId,
  aiEnabled = true,
  disabledMessage,
}: {
  jobId: string;
  aiEnabled?: boolean;
  disabledMessage?: string | null;
}) {
  const [pending, setPending] = useState(false);

  async function handleGenerate() {
    setPending(true);
    const result = await generateAiDraftsForJob(jobId);
    setPending(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    if ("ok" in result && result.ok) {
      toast.success(
        `Generated ${result.count} AI draft proposal${result.count === 1 ? "" : "s"} — review before approving`
      );
      window.location.reload();
    }
  }

  if (!aiEnabled) {
    return (
      <Button type="button" size="sm" variant="outline" disabled title={disabledMessage ?? undefined}>
        <Sparkles className="mr-2 size-4" />
        AI provider disabled
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="default"
      disabled={pending}
      onClick={handleGenerate}
      title={disabledMessage ?? undefined}
    >
      <Sparkles className="mr-2 size-4" />
      {pending ? "Generating…" : "Generate AI Drafts"}
    </Button>
  );
}
