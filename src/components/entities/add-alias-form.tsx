"use client";

import { useState } from "react";
import { createEntityAlias } from "@/actions/entities";
import { normalizeEntityAlias } from "@/lib/entities/normalize-alias";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function AddAliasForm({ entityId }: { entityId: string }) {
  const [alias, setAlias] = useState("");
  const [pending, setPending] = useState(false);
  const preview = normalizeEntityAlias(alias);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData();
    fd.set("entity_id", entityId);
    fd.set("alias", alias);
    const result = await createEntityAlias(fd);
    setPending(false);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Alias added");
    setAlias("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="alias">New alias</Label>
        <Input
          id="alias"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="Open Pose"
          required
        />
        {preview && (
          <p className="text-xs text-muted-foreground">
            Will normalize to: <code className="font-mono">{preview}</code>
          </p>
        )}
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Adding…" : "Add alias"}
      </Button>
    </form>
  );
}
