"use client";

import { useState } from "react";
import { createNormalizationJob } from "@/actions/normalization";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Template = { code: string; label: string };
type Domain = { code: string; label: string };

export function CreateNormalizationJobForm({
  extractionId,
  domains,
  templates,
  defaultDomainCode = "comfyui",
}: {
  extractionId: string;
  domains: Domain[];
  templates: Template[];
  defaultDomainCode?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    fd.set("source_extraction_result_id", extractionId);
    const result = await createNormalizationJob(fd);
    setPending(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Normalization job created");
    if ("jobId" in result && result.jobId) {
      router.push(`/normalization/${result.jobId}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-border/50 p-4">
      <p className="text-sm font-medium">Create normalization job</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="template_code">Template</Label>
          <select
            id="template_code"
            name="template_code"
            required
            defaultValue={templates.find((t) => t.code === "concept_card")?.code ?? templates[0]?.code}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {templates.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="domain_code">Domain</Label>
          <select
            id="domain_code"
            name="domain_code"
            required
            defaultValue={defaultDomainCode}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {domains.map((d) => (
              <option key={d.code} value={d.code}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Creating…" : "Create normalization job"}
      </Button>
    </form>
  );
}
