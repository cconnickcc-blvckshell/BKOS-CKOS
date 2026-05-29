"use client";

import { useState } from "react";
import { createRecipeStep, deleteRecipeStep } from "@/actions/recipes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

type Step = {
  id: string;
  step_number: number;
  title: string;
  instruction: string;
  required: boolean;
  estimated_cost_level: string | null;
};

export function RecipeStepsPanel({
  recipeId,
  steps,
}: {
  recipeId: string;
  steps: Step[];
}) {
  const [pending, setPending] = useState(false);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    fd.set("recipe_id", recipeId);
    const result = await createRecipeStep(fd);
    setPending(false);
    if ("error" in result && result.error) toast.error(result.error);
    else {
      toast.success("Step added");
      e.currentTarget.reset();
    }
  }

  async function handleDelete(stepId: string) {
    setPending(true);
    const result = await deleteRecipeStep(stepId, recipeId);
    setPending(false);
    if ("error" in result && result.error) toast.error(result.error);
    else toast.success("Step removed");
  }

  const nextStep =
    steps.length > 0 ? Math.max(...steps.map((s) => s.step_number)) + 1 : 1;

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">Local steps</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Steps defined on this recipe only. Inherited steps from parents appear in the
          resolved view above.
        </p>
        <ul className="space-y-2 text-sm">
          {steps.length === 0 ? (
            <p className="text-muted-foreground">No local steps yet.</p>
          ) : (
            steps.map((s) => (
              <li
                key={s.id}
                className="flex items-start justify-between gap-2 rounded-md border border-border/50 p-3"
              >
                <div>
                  <span className="font-medium">
                    {s.step_number}. {s.title}
                  </span>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {s.instruction}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending}
                  onClick={() => handleDelete(s.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))
          )}
        </ul>

        <form onSubmit={handleAdd} className="space-y-3 border-t border-border/60 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="step_number">Step #</Label>
              <Input
                id="step_number"
                name="step_number"
                type="number"
                min={1}
                required
                defaultValue={nextStep}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="step_title">Title</Label>
              <Input id="step_title" name="title" required placeholder="Export for Meta" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="instruction">Instruction</Label>
            <Textarea id="instruction" name="instruction" rows={2} required />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="required" defaultChecked className="rounded" />
              Required
            </label>
            <div className="space-y-2">
              <Label htmlFor="estimated_cost_level" className="sr-only">
                Cost level
              </Label>
              <select
                id="estimated_cost_level"
                name="estimated_cost_level"
                className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Cost level</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            Add step
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
