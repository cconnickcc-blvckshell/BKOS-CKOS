"use client";

import { useState } from "react";
import { createKnowledgeRelationship } from "@/actions/knowledge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import type { KnowledgeRecord, RelationshipType } from "@/types/database";

export function CreateRelationshipDialog({
  records,
  relationshipTypes,
}: {
  records: Pick<KnowledgeRecord, "id" | "title">[];
  relationshipTypes: RelationshipType[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    const result = await createKnowledgeRelationship(formData);
    setPending(false);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Relationship created");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button size="sm" variant="outline">
          <Link2 className="mr-1 h-4 w-4" />
          Link records
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create knowledge relationship</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="from_record_id">From record</Label>
            <select
              id="from_record_id"
              name="from_record_id"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Select…</option>
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="relationship_type_id">Relationship</Label>
            <select
              id="relationship_type_id"
              name="relationship_type_id"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Select…</option>
              {relationshipTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="to_record_id">To record</Label>
            <select
              id="to_record_id"
              name="to_record_id"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Select…</option>
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="evidence">Evidence / notes</Label>
            <Textarea id="evidence" name="evidence" rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weight">Weight (0–1)</Label>
            <Input
              id="weight"
              name="weight"
              type="number"
              min={0}
              max={1}
              step={0.01}
              defaultValue={1}
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Create link"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
