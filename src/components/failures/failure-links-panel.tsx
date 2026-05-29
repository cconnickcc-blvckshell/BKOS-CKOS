"use client";

import { useState } from "react";
import {
  linkKnowledgeFailure,
  linkWorkflowFailure,
  unlinkKnowledgeFailure,
  unlinkWorkflowFailure,
} from "@/actions/failures";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import Link from "next/link";
import { Trash2 } from "lucide-react";

type WorkflowLink = {
  id: string;
  likelihood_score: number | null;
  notes: string | null;
  workflows: { id: string; title: string } | null;
};

type KnowledgeLink = {
  id: string;
  relationship_notes: string | null;
  knowledge_records: { id: string; title: string } | null;
};

export function FailureLinksPanel({
  failureId,
  workflowLinks,
  knowledgeLinks,
  workflows,
  knowledgeRecords,
}: {
  failureId: string;
  workflowLinks: WorkflowLink[];
  knowledgeLinks: KnowledgeLink[];
  workflows: { id: string; title: string }[];
  knowledgeRecords: { id: string; title: string }[];
}) {
  const [pending, setPending] = useState(false);

  async function submitWorkflow(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    fd.set("failure_id", failureId);
    const result = await linkWorkflowFailure(fd);
    setPending(false);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Workflow linked");
      e.currentTarget.reset();
    }
  }

  async function submitKnowledge(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    fd.set("failure_id", failureId);
    const result = await linkKnowledgeFailure(fd);
    setPending(false);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Knowledge record linked");
      e.currentTarget.reset();
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Linked workflows</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm">
            {workflowLinks.length === 0 ? (
              <p className="text-muted-foreground">No workflows linked.</p>
            ) : (
              workflowLinks.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between rounded-md border border-border/50 p-3"
                >
                  <div>
                    <Link
                      href={`/workflows/${l.workflows?.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {l.workflows?.title ?? "Workflow"}
                    </Link>
                    {l.likelihood_score != null && (
                      <p className="text-xs text-muted-foreground">
                        Likelihood: {(l.likelihood_score * 100).toFixed(0)}%
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      const r = await unlinkWorkflowFailure(l.id, failureId);
                      if ("error" in r && r.error) toast.error(r.error);
                      else toast.success("Unlinked");
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))
            )}
          </ul>
          <form onSubmit={submitWorkflow} className="space-y-2 border-t border-border/40 pt-4">
            <Label>Link workflow</Label>
            <select
              name="workflow_id"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Select workflow…</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
            <Input
              name="likelihood_score"
              type="number"
              min={0}
              max={1}
              step={0.01}
              placeholder="Likelihood 0–1"
            />
            <Textarea name="notes" rows={2} placeholder="Notes" />
            <Button type="submit" size="sm" disabled={pending}>
              Link workflow
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Linked knowledge</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm">
            {knowledgeLinks.length === 0 ? (
              <p className="text-muted-foreground">No knowledge records linked.</p>
            ) : (
              knowledgeLinks.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between rounded-md border border-border/50 p-3"
                >
                  <div>
                    <Link
                      href={`/knowledge/${l.knowledge_records?.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {l.knowledge_records?.title ?? "Record"}
                    </Link>
                    {l.relationship_notes && (
                      <p className="text-xs text-muted-foreground">
                        {l.relationship_notes}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      const r = await unlinkKnowledgeFailure(l.id, failureId);
                      if ("error" in r && r.error) toast.error(r.error);
                      else toast.success("Unlinked");
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))
            )}
          </ul>
          <form onSubmit={submitKnowledge} className="space-y-2 border-t border-border/40 pt-4">
            <Label>Link knowledge record</Label>
            <select
              name="knowledge_record_id"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Select record…</option>
              {knowledgeRecords.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.title}
                </option>
              ))}
            </select>
            <Textarea name="relationship_notes" rows={2} placeholder="Relationship notes" />
            <Button type="submit" size="sm" disabled={pending}>
              Link knowledge
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
