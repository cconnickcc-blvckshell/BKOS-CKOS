"use client";

import { useState, useTransition } from "react";
import {
  assignEntityToKnowledgeRecord,
  listEntities,
  resolveAliasAction,
} from "@/actions/entities";
import { normalizeEntityAlias } from "@/lib/entities/normalize-alias";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import Link from "next/link";

type EntityOption = {
  id: string;
  canonical_slug: string;
  display_name: string;
  knowledge_domains: { code: string; label: string } | null;
  entity_types: { code: string; label: string } | null;
};

export function AssignEntityPanel({
  knowledgeRecordId,
  currentEntity,
  defaultDomainCode = "comfyui",
}: {
  knowledgeRecordId: string;
  currentEntity: {
    id: string;
    canonical_slug: string;
    display_name: string;
  } | null;
  defaultDomainCode?: string;
}) {
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState(currentEntity?.id ?? "");
  const [resolveInput, setResolveInput] = useState("");
  const [resolvePreview, setResolvePreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function loadEntities() {
    if (loaded) return;
    const data = await listEntities(defaultDomainCode);
    setEntities(data as EntityOption[]);
    setLoaded(true);
  }

  function handleResolveInput(value: string) {
    setResolveInput(value);
    setResolvePreview(normalizeEntityAlias(value));
  }

  async function tryResolve() {
    const { result, error } = await resolveAliasAction(
      defaultDomainCode,
      resolveInput
    );
    if (error) {
      toast.error(error);
      return;
    }
    if (!result) {
      toast.message("No canonical entity matched");
      return;
    }
    setSelectedId(result.entity_id);
    toast.success(`Resolved → ${result.canonical_slug} (${result.match_type})`);
  }

  function saveAssignment() {
    startTransition(async () => {
      const result = await assignEntityToKnowledgeRecord(
        knowledgeRecordId,
        selectedId || null
      );
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(selectedId ? "Canonical entity linked" : "Entity unlinked");
    });
  }

  return (
    <div className="space-y-4">
      {currentEntity ? (
        <div className="rounded-md border border-border/50 bg-muted/20 p-3 text-sm">
          <p className="text-muted-foreground">Current canonical entity</p>
          <Link
            href={`/entities/${currentEntity.id}`}
            className="mt-1 font-medium text-primary hover:underline"
          >
            {currentEntity.display_name}
          </Link>
          <Badge variant="outline" className="ml-2 font-mono text-xs">
            {currentEntity.canonical_slug}
          </Badge>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No canonical entity linked. Assign one to deduplicate concepts across
          knowledge records.
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="resolve-alias">Resolve alias</Label>
        <div className="flex gap-2">
          <Input
            id="resolve-alias"
            value={resolveInput}
            onChange={(e) => handleResolveInput(e.target.value)}
            placeholder="e.g. Open Pose, Flux Dev"
          />
          <Button type="button" variant="outline" onClick={tryResolve}>
            Resolve
          </Button>
        </div>
        {resolvePreview && (
          <p className="text-xs text-muted-foreground">
            Normalized: <code className="font-mono">{resolvePreview}</code>
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="entity-select">Select entity</Label>
        <select
          id="entity-select"
          value={selectedId}
          onFocus={loadEntities}
          onChange={(e) => setSelectedId(e.target.value)}
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

      <div className="flex gap-2">
        <Button onClick={saveAssignment} disabled={pending} size="sm">
          {pending ? "Saving…" : "Save assignment"}
        </Button>
        {selectedId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelectedId("")}
          >
            Clear selection
          </Button>
        )}
      </div>
    </div>
  );
}
