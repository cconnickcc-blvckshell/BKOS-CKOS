"use client";

import { useState } from "react";
import {
  generateEmbeddingsForEntity,
  processEmbeddingQueue,
  rebuildEmbeddingsAction,
} from "@/actions/embeddings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const ENTITY_TYPES = [
  "knowledge_record",
  "workflow",
  "workflow_analysis",
  "failure_record",
  "recipe",
  "recipe_version",
  "source_extraction_result",
];

export function EmbeddingAdminActions() {
  const [pending, setPending] = useState(false);
  const [entityType, setEntityType] = useState("knowledge_record");
  const [entityId, setEntityId] = useState("");

  async function runQueue() {
    setPending(true);
    const result = await processEmbeddingQueue(25);
    setPending(false);
    if ("error" in result && result.error) toast.error(result.error);
    else toast.success(`Processed ${result.processed} jobs`);
  }

  async function runGenerate() {
    if (!entityId.trim()) return;
    setPending(true);
    const result = await generateEmbeddingsForEntity(entityType, entityId.trim());
    setPending(false);
    if ("error" in result && result.error) toast.error(result.error);
    else if ("skipped" in result && result.skipped) toast.message(result.reason ?? "Skipped");
    else toast.success("Embedding job completed or queued");
  }

  async function runRebuild() {
    if (!entityId.trim()) return;
    setPending(true);
    const result = await rebuildEmbeddingsAction(entityType, entityId.trim());
    setPending(false);
    if ("error" in result && result.error) toast.error(result.error);
    else if ("skipped" in result && result.skipped) toast.message(result.reason ?? "Skipped");
    else toast.success("Rebuild requested");
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/60 p-4">
      <p className="text-sm font-medium">Manual embedding controls</p>
      <Button size="sm" onClick={runQueue} disabled={pending}>
        Process pending queue (25)
      </Button>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="entity_type">Entity type</Label>
          <select
            id="entity_type"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="entity_id">Entity UUID</Label>
          <Input
            id="entity_id"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder="UUID"
            className="font-mono text-xs"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={runGenerate} disabled={pending}>
          Generate embeddings
        </Button>
        <Button size="sm" variant="outline" onClick={runRebuild} disabled={pending}>
          Rebuild embeddings
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Set EMBEDDING_PROVIDER to enable semantic search (Ollama, LM Studio, or
        OpenAI-compatible). With EMBEDDING_PROVIDER=disabled, jobs are marked
        provider_disabled and full-text search still works.
      </p>
    </div>
  );
}
