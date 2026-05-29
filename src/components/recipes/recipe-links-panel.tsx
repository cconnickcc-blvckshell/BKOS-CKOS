"use client";

import { useState, type ReactNode } from "react";
import {
  linkRecipeFailure,
  linkRecipeKnowledge,
  linkRecipeWorkflow,
  unlinkRecipeFailure,
  unlinkRecipeKnowledge,
  unlinkRecipeWorkflow,
} from "@/actions/recipes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import Link from "next/link";
import { Trash2 } from "lucide-react";

type WorkflowLink = {
  id: string;
  is_primary: boolean;
  notes: string | null;
  workflows: { id: string; title: string } | null;
};

type KnowledgeLink = {
  id: string;
  relationship_notes: string | null;
  knowledge_records: { id: string; title: string } | null;
};

type FailureLink = {
  id: string;
  mitigation_notes: string | null;
  failure_records: { id: string; symptom: string } | null;
};

export function RecipeLinksPanel({
  recipeId,
  workflowLinks,
  knowledgeLinks,
  failureLinks,
  workflows,
  knowledgeRecords,
  failures,
}: {
  recipeId: string;
  workflowLinks: WorkflowLink[];
  knowledgeLinks: KnowledgeLink[];
  failureLinks: FailureLink[];
  workflows: { id: string; title: string }[];
  knowledgeRecords: { id: string; title: string }[];
  failures: { id: string; symptom: string }[];
}) {
  const [pending, setPending] = useState(false);

  async function submit(
    action: (fd: FormData) => Promise<{ error?: string; ok?: boolean }>,
    e: React.FormEvent<HTMLFormElement>,
    success: string
  ) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    fd.set("recipe_id", recipeId);
    const result = await action(fd);
    setPending(false);
    if (result.error) toast.error(result.error);
    else {
      toast.success(success);
      e.currentTarget.reset();
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <LinkSection
        title="Workflows"
        empty="No workflows linked."
        items={workflowLinks.map((l) => ({
          id: l.id,
          href: `/workflows/${l.workflows?.id}`,
          label: l.workflows?.title ?? "Workflow",
          meta: l.is_primary ? "primary" : undefined,
          onDelete: () => unlinkRecipeWorkflow(l.id, recipeId),
        }))}
        form={
          <form
            onSubmit={(e) => submit(linkRecipeWorkflow, e, "Workflow linked")}
            className="space-y-2"
          >
            <select
              name="workflow_id"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Select workflow</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" name="is_primary" />
              Primary workflow
            </label>
            <Input name="notes" placeholder="Notes" />
            <Button type="submit" size="sm" disabled={pending}>
              Link
            </Button>
          </form>
        }
        pending={pending}
      />

      <LinkSection
        title="Knowledge"
        empty="No knowledge records linked."
        items={knowledgeLinks.map((l) => ({
          id: l.id,
          href: `/knowledge/${l.knowledge_records?.id}`,
          label: l.knowledge_records?.title ?? "Record",
          onDelete: () => unlinkRecipeKnowledge(l.id, recipeId),
        }))}
        form={
          <form
            onSubmit={(e) => submit(linkRecipeKnowledge, e, "Knowledge linked")}
            className="space-y-2"
          >
            <select
              name="knowledge_record_id"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Select record</option>
              {knowledgeRecords.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.title}
                </option>
              ))}
            </select>
            <Textarea name="relationship_notes" rows={2} placeholder="Notes" />
            <Button type="submit" size="sm" disabled={pending}>
              Link
            </Button>
          </form>
        }
        pending={pending}
      />

      <LinkSection
        title="Failures"
        empty="No failure mitigations linked."
        items={failureLinks.map((l) => ({
          id: l.id,
          href: `/failures/${l.failure_records?.id}`,
          label: l.failure_records?.symptom ?? "Failure",
          onDelete: () => unlinkRecipeFailure(l.id, recipeId),
        }))}
        form={
          <form
            onSubmit={(e) => submit(linkRecipeFailure, e, "Failure linked")}
            className="space-y-2"
          >
            <select
              name="failure_id"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Select failure</option>
              {failures.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.symptom}
                </option>
              ))}
            </select>
            <Textarea name="mitigation_notes" rows={2} placeholder="Mitigation notes" />
            <Button type="submit" size="sm" disabled={pending}>
              Link
            </Button>
          </form>
        }
        pending={pending}
      />
    </div>
  );
}

function LinkSection({
  title,
  empty,
  items,
  form,
  pending,
}: {
  title: string;
  empty: string;
  items: {
    id: string;
    href?: string;
    label: string;
    meta?: string;
    onDelete: () => Promise<{ error?: string; ok?: boolean }>;
  }[];
  form: ReactNode;
  pending: boolean;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm">
          {items.length === 0 ? (
            <p className="text-muted-foreground">{empty}</p>
          ) : (
            items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-md border border-border/50 p-3"
              >
                <div>
                  {item.href ? (
                    <Link href={item.href} className="font-medium hover:text-primary">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="font-medium">{item.label}</span>
                  )}
                  {item.meta && (
                    <p className="text-xs text-muted-foreground">{item.meta}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending}
                  onClick={async () => {
                    const r = await item.onDelete();
                    if (r.error) toast.error(r.error);
                    else toast.success("Unlinked");
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))
          )}
        </ul>
        {form}
      </CardContent>
    </Card>
  );
}
