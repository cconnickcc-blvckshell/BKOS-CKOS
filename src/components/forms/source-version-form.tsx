"use client";

import { createSourceVersion } from "@/actions/sources";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useState } from "react";

export function SourceVersionForm({ sourceId }: { sourceId: string }) {
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    const result = await createSourceVersion(formData);
    setPending(false);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Version saved");
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <input type="hidden" name="source_id" value={sourceId} />
      <div className="space-y-2">
        <Label htmlFor="content">Content</Label>
        <Textarea id="content" name="content" rows={8} required />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save version"}
      </Button>
    </form>
  );
}
