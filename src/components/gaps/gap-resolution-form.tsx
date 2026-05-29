"use client";

import { useState } from "react";
import { updateGapResolution } from "@/actions/gaps";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type GapStatus = { code: string; label: string };

export function GapResolutionForm({
  gapId,
  statuses,
  currentStatusCode,
  currentNotes,
}: {
  gapId: string;
  statuses: GapStatus[];
  currentStatusCode: string;
  currentNotes: string | null;
}) {
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const result = await updateGapResolution(gapId, new FormData(e.currentTarget));
    setPending(false);

    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Gap updated");
      window.location.reload();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="status_code">Status</Label>
        <select
          id="status_code"
          name="status_code"
          required
          defaultValue={currentStatusCode}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {statuses.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="resolution_notes">Resolution notes</Label>
        <Textarea
          id="resolution_notes"
          name="resolution_notes"
          rows={3}
          defaultValue={currentNotes ?? ""}
          placeholder="What was done to address or dismiss this gap?"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Update gap"}
      </Button>
    </form>
  );
}
