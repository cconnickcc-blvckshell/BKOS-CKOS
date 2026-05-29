"use client";

import { useState } from "react";
import { createKnowledgeRecord } from "@/actions/knowledge";
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
import { Plus } from "lucide-react";
import type { KnowledgeType } from "@/types/database";

export function CreateKnowledgeDialog({ types }: { types: KnowledgeType[] }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    const result = await createKnowledgeRecord(formData);
    setPending(false);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Knowledge record created");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Add record
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create knowledge record</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="knowledge_type_id">Knowledge type</Label>
            <select
              id="knowledge_type_id"
              name="knowledge_type_id"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            >
              <option value="">Select type…</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="summary">Summary</Label>
            <Textarea id="summary" name="summary" rows={3} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="structured_data">Structured data (JSON)</Label>
            <Textarea
              id="structured_data"
              name="structured_data"
              rows={5}
              placeholder='{"node_class":"KSampler","category":"sampling"}'
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confidence">Confidence</Label>
            <Input
              id="confidence"
              name="confidence"
              type="number"
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.85}
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Create record"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
