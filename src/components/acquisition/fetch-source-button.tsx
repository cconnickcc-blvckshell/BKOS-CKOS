"use client";

import { useState } from "react";
import { fetchSourceFromUrl } from "@/actions/acquisition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { useRouter } from "next/navigation";

export function FetchSourceButton({
  sourceId,
  defaultUrl,
}: {
  sourceId: string;
  defaultUrl?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [url, setUrl] = useState(defaultUrl ?? "");

  async function handleFetch() {
    setPending(true);
    const result = await fetchSourceFromUrl(sourceId, url || undefined);
    setPending(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Source fetched and extracted");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-2">
        <Label htmlFor="fetch_url">Fetch URL</Label>
        <Input
          id="fetch_url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://comfyui-wiki.com/..."
        />
      </div>
      <Button type="button" onClick={handleFetch} disabled={pending || !url.trim()}>
        <Download className="mr-2 h-4 w-4" />
        {pending ? "Fetching…" : "Fetch source"}
      </Button>
    </div>
  );
}
