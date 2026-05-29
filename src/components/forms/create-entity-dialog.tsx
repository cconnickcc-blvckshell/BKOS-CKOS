"use client";

import { useState } from "react";
import { createEntity } from "@/actions/entities";
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

type Domain = { id: string; code: string; label: string };
type EntityType = { id: string; code: string; label: string };

export function CreateEntityDialog({
  domains,
  entityTypes,
  defaultDomainCode = "comfyui",
}: {
  domains: Domain[];
  entityTypes: EntityType[];
  defaultDomainCode?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    const result = await createEntity(formData);
    setPending(false);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Canonical entity created");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Add entity
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create canonical entity</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="domain_code">Domain</Label>
            <select
              id="domain_code"
              name="domain_code"
              required
              defaultValue={defaultDomainCode}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {domains.map((d) => (
                <option key={d.id} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="entity_type_code">Entity type</Label>
            <select
              id="entity_type_code"
              name="entity_type_code"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Select…</option>
              {entityTypes.map((t) => (
                <option key={t.id} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="canonical_slug">Canonical slug</Label>
            <Input
              id="canonical_slug"
              name="canonical_slug"
              required
              pattern="[a-z0-9_]+"
              placeholder="openpose_controlnet"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="display_name">Display name</Label>
            <Input id="display_name" name="display_name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create entity"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
