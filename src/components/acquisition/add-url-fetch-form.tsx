"use client";

import { useState } from "react";
import { createSourceAndFetch } from "@/actions/acquisition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { SourceType } from "@/types/database";

export function AddUrlFetchForm({ types }: { types: SourceType[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const result = await createSourceAndFetch(new FormData(e.currentTarget));
    setPending(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      if ("sourceId" in result && result.sourceId) {
        router.push(`/sources/${result.sourceId}`);
      }
      return;
    }

    toast.success("Source created and fetched");
    if ("sourceId" in result) {
      router.push(`/sources/${result.sourceId}`);
    }
  }

  const wikiType = types.find((t) => t.code === "wiki");
  const docType = types.find((t) => t.code === "documentation");

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="url">URL *</Label>
        <Input
          id="url"
          name="url"
          type="url"
          required
          placeholder="https://comfyui-wiki.com/en/..."
        />
        <p className="text-xs text-muted-foreground">
          Only trusted domains (ComfyUI Wiki, docs, GitHub, Hugging Face, arXiv) can be fetched.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="title">Title (optional)</Label>
        <Input id="title" name="title" placeholder="Defaults to hostname if empty" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="source_type_id">Source type *</Label>
        <select
          id="source_type_id"
          name="source_type_id"
          required
          defaultValue={wikiType?.id ?? docType?.id ?? types[0]?.id}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={2} />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Fetching…" : "Add URL and fetch"}
      </Button>
    </form>
  );
}
