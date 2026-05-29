"use client";

import { useState } from "react";
import {
  approveNormalizationOutput,
  rejectNormalizationOutput,
  updateNormalizationOutput,
} from "@/actions/normalization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import Link from "next/link";

type Output = {
  id: string;
  proposed_title: string;
  proposed_summary: string | null;
  proposed_structured_data: Record<string, unknown>;
  proposed_entity_alias: string | null;
  resolved_entity_id: string | null;
  confidence_score: number | null;
  review_notes: string | null;
  citations: unknown;
  normalization_statuses: { code: string; label: string } | null;
  entities: { canonical_slug: string; display_name: string } | null;
  normalization_review_decisions: {
    decision: string;
    created_knowledge_record_id: string | null;
  }[];
};

export function NormalizationOutputEditor({
  output,
  domainCode,
  extractionMarkdown,
}: {
  output: Output;
  domainCode: string;
  extractionMarkdown?: string | null;
}) {
  const [pending, setPending] = useState(false);
  const statusCode = output.normalization_statuses?.code ?? "pending_review";
  const finalized = statusCode === "approved" || statusCode === "rejected";
  const approvedRecordId = output.normalization_review_decisions?.find(
    (d) => d.decision === "approved"
  )?.created_knowledge_record_id;

  const jsonString = JSON.stringify(output.proposed_structured_data ?? {}, null, 2);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    fd.set("domain_code", domainCode);
    const result = await updateNormalizationOutput(output.id, fd);
    setPending(false);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success(
        result.resolved_entity_id
          ? "Saved — entity resolved"
          : "Draft saved"
      );
    }
  }

  async function handleApprove() {
    setPending(true);
    const notes = (
      document.getElementById(`review_notes_${output.id}`) as HTMLTextAreaElement
    )?.value;
    const result = await approveNormalizationOutput(output.id, notes);
    setPending(false);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Approved — knowledge record published");
      if ("knowledgeRecordId" in result && result.knowledgeRecordId) {
        window.location.href = `/knowledge/${result.knowledgeRecordId}`;
      }
    }
  }

  async function handleReject() {
    setPending(true);
    const notes = (
      document.getElementById(`review_notes_${output.id}`) as HTMLTextAreaElement
    )?.value;
    const result = await rejectNormalizationOutput(output.id, notes);
    setPending(false);
    if ("error" in result && result.error) toast.error(result.error);
    else toast.success("Output rejected");
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Draft knowledge record</span>
        <Badge variant="secondary">{output.normalization_statuses?.label}</Badge>
        {output.entities && (
          <Badge variant="outline">
            {output.entities.display_name} ({output.entities.canonical_slug})
          </Badge>
        )}
        {approvedRecordId && (
          <Link href={`/knowledge/${approvedRecordId}`} className="text-sm text-primary hover:underline">
            View published record →
          </Link>
        )}
      </div>

      {extractionMarkdown && !finalized && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Reference: extracted markdown
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">
            {extractionMarkdown.slice(0, 8000)}
          </pre>
        </details>
      )}

      <form onSubmit={handleSave} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor={`title_${output.id}`}>Proposed title *</Label>
          <Input
            id={`title_${output.id}`}
            name="proposed_title"
            required
            defaultValue={output.proposed_title}
            disabled={finalized}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`summary_${output.id}`}>Summary</Label>
          <Textarea
            id={`summary_${output.id}`}
            name="proposed_summary"
            rows={3}
            defaultValue={output.proposed_summary ?? ""}
            disabled={finalized}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`alias_${output.id}`}>Entity alias (optional)</Label>
            <Input
              id={`alias_${output.id}`}
              name="proposed_entity_alias"
              placeholder="e.g. flux kontext"
              defaultValue={output.proposed_entity_alias ?? ""}
              disabled={finalized}
            />
            <p className="text-xs text-muted-foreground">
              Resolved on save via canonical entity resolver ({domainCode}).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`confidence_${output.id}`}>Confidence</Label>
            <Input
              id={`confidence_${output.id}`}
              name="confidence_score"
              type="number"
              min={0}
              max={1}
              step={0.01}
              defaultValue={output.confidence_score ?? 0.5}
              disabled={finalized}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`structured_${output.id}`}>Structured data (JSON)</Label>
          <Textarea
            id={`structured_${output.id}`}
            name="proposed_structured_data"
            rows={8}
            className="font-mono text-xs"
            defaultValue={jsonString}
            disabled={finalized}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`review_notes_${output.id}`}>Review notes</Label>
          <Textarea
            id={`review_notes_${output.id}`}
            name="review_notes"
            rows={2}
            defaultValue={output.review_notes ?? ""}
            disabled={finalized}
          />
        </div>

        {!finalized && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="secondary" disabled={pending}>
              Save draft
            </Button>
            <Button type="button" size="sm" disabled={pending} onClick={handleApprove}>
              Approve & publish
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={handleReject}
            >
              Reject
            </Button>
          </div>
        )}
      </form>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Citations</summary>
        <pre className="mt-2 overflow-auto rounded-md bg-muted p-2">
          {JSON.stringify(output.citations, null, 2)}
        </pre>
      </details>
    </div>
  );
}
