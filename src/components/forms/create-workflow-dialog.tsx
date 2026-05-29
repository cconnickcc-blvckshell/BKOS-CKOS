"use client";

import { useState } from "react";
import { createWorkflow } from "@/actions/workflows";
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

type Category = { id: string; code: string; label: string };

export function CreateWorkflowDialog({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    const result = await createWorkflow(formData);
    setPending(false);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Workflow ingested");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Ingest workflow
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ingest ComfyUI workflow JSON</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category_id">Category</Label>
            <select
              id="category_id"
              name="category_id"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workflow_json">Workflow JSON</Label>
            <Textarea
              id="workflow_json"
              name="workflow_json"
              rows={10}
              required
              className="font-mono text-xs"
              placeholder='Paste ComfyUI API workflow JSON…'
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Parsing…" : "Ingest workflow"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
