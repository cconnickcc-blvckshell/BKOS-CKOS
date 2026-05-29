"use client";

import { useState } from "react";
import { addCampaignUrl } from "@/actions/curation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type SourceType = { id: string; code: string; label: string };

export function AddCampaignUrlForm({
  campaignId,
  sourceTypes,
}: {
  campaignId: string;
  sourceTypes: SourceType[];
}) {
  const [pending, setPending] = useState(false);

  const wikiType = sourceTypes.find((t) => t.code === "wiki");
  const docType = sourceTypes.find((t) => t.code === "documentation");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const result = await addCampaignUrl(campaignId, new FormData(e.currentTarget));
    setPending(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("URL added to campaign");
    window.location.reload();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="url">Trusted URL *</Label>
        <Input
          id="url"
          name="url"
          type="url"
          required
          placeholder="https://comfyui-wiki.com/en/..."
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title (optional)</Label>
          <Input id="title" name="title" placeholder="Page title" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="source_type_id">Source type *</Label>
          <select
            id="source_type_id"
            name="source_type_id"
            required
            defaultValue={wikiType?.id ?? docType?.id ?? sourceTypes[0]?.id}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {sourceTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Adding…" : "Add URL to campaign"}
      </Button>
    </form>
  );
}
