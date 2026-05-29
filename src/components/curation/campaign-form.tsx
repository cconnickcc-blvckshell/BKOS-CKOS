"use client";

import { useState } from "react";
import {
  createCurationCampaign,
  updateCurationCampaign,
} from "@/actions/curation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Domain = { code: string; label: string };
type CampaignStatus = { code: string; label: string };
type Template = { code: string; label: string };

type Campaign = {
  id: string;
  title: string;
  description: string | null;
  objective: string | null;
  target_entities: unknown;
  target_topics: unknown;
  metadata: Record<string, unknown>;
  curation_campaign_statuses: { code: string } | null;
  knowledge_domains: { code: string };
};

export function CampaignForm({
  mode,
  domains,
  statuses,
  templates,
  campaign,
}: {
  mode: "create" | "edit";
  domains: Domain[];
  statuses: CampaignStatus[];
  templates: Template[];
  campaign?: Campaign;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const defaultTemplate =
    (campaign?.metadata?.default_template_code as string) ?? "concept_card";
  const domainCode = campaign?.knowledge_domains?.code ?? "comfyui";
  const statusCode = campaign?.curation_campaign_statuses?.code ?? "draft";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);

    const result =
      mode === "create"
        ? await createCurationCampaign(fd)
        : await updateCurationCampaign(campaign!.id, fd);

    setPending(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(mode === "create" ? "Campaign created" : "Campaign saved");
    if (mode === "create" && "campaignId" in result && result.campaignId) {
      router.push(`/curation/${result.campaignId}`);
    } else {
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          name="title"
          required
          defaultValue={campaign?.title ?? ""}
          placeholder="e.g. Flux Kontext Mastery"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="objective">Objective</Label>
        <Textarea
          id="objective"
          name="objective"
          rows={2}
          defaultValue={campaign?.objective ?? ""}
          placeholder="What knowledge should this campaign produce?"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={campaign?.description ?? ""}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="domain_code">Domain *</Label>
          <select
            id="domain_code"
            name="domain_code"
            required
            defaultValue={domainCode}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {domains.map((d) => (
              <option key={d.code} value={d.code}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status_code">Status</Label>
          <select
            id="status_code"
            name="status_code"
            defaultValue={statusCode}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {statuses.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="default_template_code">Default normalization template</Label>
        <select
          id="default_template_code"
          name="default_template_code"
          defaultValue={defaultTemplate}
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
        <Label htmlFor="target_topics">Target topics (JSON array)</Label>
        <Textarea
          id="target_topics"
          name="target_topics"
          rows={2}
          className="font-mono text-xs"
          defaultValue={JSON.stringify(campaign?.target_topics ?? [], null, 2)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="target_entities">Target entities (JSON array)</Label>
        <Textarea
          id="target_entities"
          name="target_entities"
          rows={2}
          className="font-mono text-xs"
          defaultValue={JSON.stringify(campaign?.target_entities ?? [], null, 2)}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : mode === "create" ? "Create campaign" : "Save changes"}
      </Button>
    </form>
  );
}
