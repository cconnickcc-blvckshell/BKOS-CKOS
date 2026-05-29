"use client";

import { useState } from "react";
import {
  createFailureCause,
  createFailureFix,
  deleteFailureCause,
  deleteFailureFix,
} from "@/actions/failures";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

type Cause = {
  id: string;
  cause: string;
  confidence_score: number | null;
  evidence: string | null;
  sort_order: number;
};

type Fix = {
  id: string;
  recommended_fix: string;
  effectiveness_score: number | null;
  risk_level: string | null;
  notes: string | null;
  sort_order: number;
};

export function CausesFixesPanel({
  failureId,
  causes,
  fixes,
}: {
  failureId: string;
  causes: Cause[];
  fixes: Fix[];
}) {
  const [pending, setPending] = useState(false);

  async function submitCause(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    fd.set("failure_id", failureId);
    const result = await createFailureCause(fd);
    setPending(false);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Cause added");
      e.currentTarget.reset();
    }
  }

  async function submitFix(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    fd.set("failure_id", failureId);
    const result = await createFailureFix(fd);
    setPending(false);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Fix added");
      e.currentTarget.reset();
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Likely causes ({causes.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm">
            {causes.map((c) => (
              <li
                key={c.id}
                className="flex items-start justify-between gap-2 rounded-md border border-border/50 p-3"
              >
                <div>
                  <p className="font-medium">{c.cause}</p>
                  {c.confidence_score != null && (
                    <p className="text-xs text-muted-foreground">
                      Confidence: {(c.confidence_score * 100).toFixed(0)}%
                    </p>
                  )}
                  {c.evidence && (
                    <p className="mt-1 text-xs text-muted-foreground">{c.evidence}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={async () => {
                    const r = await deleteFailureCause(c.id, failureId);
                    if ("error" in r && r.error) toast.error(r.error);
                    else toast.success("Removed");
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <form onSubmit={submitCause} className="space-y-2 border-t border-border/40 pt-4">
            <Label>Add cause</Label>
            <Input name="cause" required placeholder="Describe likely cause" />
            <div className="grid grid-cols-2 gap-2">
              <Input
                name="confidence_score"
                type="number"
                min={0}
                max={1}
                step={0.01}
                placeholder="Confidence"
              />
              <Input name="sort_order" type="number" defaultValue={causes.length + 1} />
            </div>
            <Textarea name="evidence" rows={2} placeholder="Evidence (optional)" />
            <Button type="submit" size="sm" disabled={pending}>
              Add cause
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Ranked fixes ({fixes.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm">
            {fixes.map((f, i) => (
              <li
                key={f.id}
                className="flex items-start justify-between gap-2 rounded-md border border-border/50 p-3"
              >
                <div>
                  <p className="text-xs text-muted-foreground">#{i + 1}</p>
                  <p className="font-medium">{f.recommended_fix}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {f.effectiveness_score != null && (
                      <span>
                        Effectiveness: {(f.effectiveness_score * 100).toFixed(0)}%
                      </span>
                    )}
                    {f.risk_level && <span>Risk: {f.risk_level}</span>}
                  </div>
                  {f.notes && (
                    <p className="mt-1 text-xs text-muted-foreground">{f.notes}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    const r = await deleteFailureFix(f.id, failureId);
                    if ("error" in r && r.error) toast.error(r.error);
                    else toast.success("Removed");
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <form onSubmit={submitFix} className="space-y-2 border-t border-border/40 pt-4">
            <Label>Add fix</Label>
            <Textarea name="recommended_fix" required rows={2} placeholder="Recommended fix" />
            <div className="grid grid-cols-3 gap-2">
              <Input
                name="effectiveness_score"
                type="number"
                min={0}
                max={1}
                step={0.01}
                placeholder="Effectiveness"
              />
              <Input name="risk_level" placeholder="Risk (low/med/high)" />
              <Input name="sort_order" type="number" defaultValue={fixes.length + 1} />
            </div>
            <Textarea name="notes" rows={2} placeholder="Notes" />
            <Button type="submit" size="sm" disabled={pending}>
              Add fix
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
