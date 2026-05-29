"use client";

import { useState } from "react";
import { createFailure, updateFailure } from "@/actions/failures";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Lookup = { code: string; label: string };
type Domain = Lookup & { id?: string };
type Entity = { id: string; canonical_slug: string; display_name: string };

type Initial = {
  domain_code?: string;
  symptom?: string;
  description?: string | null;
  severity_level_code?: string;
  category_code?: string;
  entity_id?: string | null;
  probability_score?: number | null;
  detection_signals?: Record<string, unknown>;
};

export function FailureRecordForm({
  mode,
  failureId,
  domains,
  severities,
  categories,
  entities,
  initial,
}: {
  mode: "create" | "edit";
  failureId?: string;
  domains: Domain[];
  severities: Lookup[];
  categories: Lookup[];
  entities: Entity[];
  initial?: Initial;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const result =
      mode === "create"
        ? await createFailure(formData)
        : await updateFailure(failureId!, formData);
    setPending(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(mode === "create" ? "Failure created" : "Failure updated");
    if (mode === "create" && "id" in result) {
      router.push(`/failures/${result.id}`);
    } else {
      router.refresh();
    }
  }

  const defaultDomain =
    initial?.domain_code ?? domains.find((d) => d.code === "comfyui")?.code ?? domains[0]?.code;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="domain_code">Domain *</Label>
          <select
            id="domain_code"
            name="domain_code"
            required
            defaultValue={defaultDomain}
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
          <Label htmlFor="symptom">Symptom *</Label>
          <Input
            id="symptom"
            name="symptom"
            required
            defaultValue={initial?.symptom}
            placeholder="Face Drift"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={initial?.description ?? ""}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="severity_level_code">Severity *</Label>
          <select
            id="severity_level_code"
            name="severity_level_code"
            required
            defaultValue={initial?.severity_level_code ?? "medium"}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {severities.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="category_code">Category *</Label>
          <select
            id="category_code"
            name="category_code"
            required
            defaultValue={initial?.category_code ?? "unknown"}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="probability_score">Probability (0–1)</Label>
          <Input
            id="probability_score"
            name="probability_score"
            type="number"
            min={0}
            max={1}
            step={0.01}
            defaultValue={initial?.probability_score ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="entity_id">Canonical entity (optional)</Label>
        <select
          id="entity_id"
          name="entity_id"
          defaultValue={initial?.entity_id ?? ""}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">— None —</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.display_name} ({e.canonical_slug})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="detection_signals">Detection signals (JSON)</Label>
        <Textarea
          id="detection_signals"
          name="detection_signals"
          rows={3}
          className="font-mono text-xs"
          defaultValue={
            initial?.detection_signals
              ? JSON.stringify(initial.detection_signals, null, 2)
              : '{"signals":[]}'
          }
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : mode === "create" ? "Create failure" : "Save changes"}
      </Button>
    </form>
  );
}
