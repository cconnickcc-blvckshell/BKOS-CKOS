"use client";

import { useState } from "react";
import { createDecisionRequest } from "@/actions/decision";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type GoalType = { code: string; label: string };
type ConstraintType = { code: string; label: string };
type Domain = { code: string; label: string };
type HardwareTier = { code: string; label: string };

const COMMON_CONSTRAINTS = [
  "hardware",
  "model_family",
  "output_platform",
  "safety_level",
  "reference_character_available",
  "source_image_available",
] as const;

export function CreateDecisionRequestForm({
  goalTypes,
  constraintTypes,
  domains,
  hardwareTiers,
}: {
  goalTypes: GoalType[];
  constraintTypes: ConstraintType[];
  domains: Domain[];
  hardwareTiers: HardwareTier[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const constraintByCode = new Map(constraintTypes.map((c) => [c.code, c]));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const result = await createDecisionRequest(fd);
    setPending(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    if ("statusCode" in result && result.statusCode === "insufficient_evidence") {
      toast.warning("Recommendation built with insufficient CKOS evidence — review warnings.");
    } else {
      toast.success("Decision recommendation ready for review");
    }

    if ("requestId" in result && result.requestId) {
      router.push(`/decision/${result.requestId}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="goal_text">Goal description *</Label>
        <Textarea
          id="goal_text"
          name="goal_text"
          required
          rows={4}
          placeholder="e.g. Create a Facebook-safe poster using a consistent demoness character on RTX 3090"
          defaultValue=""
        />
        <p className="text-xs text-muted-foreground">
          Describe what you want to accomplish. CKOS retrieves only existing approved records —
          nothing is executed automatically.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="goal_type_code">Goal type *</Label>
          <select
            id="goal_type_code"
            name="goal_type_code"
            required
            defaultValue="create_poster"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {goalTypes.map((g) => (
              <option key={g.code} value={g.code}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="domain_code">Domain</Label>
          <select
            id="domain_code"
            name="domain_code"
            defaultValue="comfyui"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {domains.map((d) => (
              <option key={d.code} value={d.code}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="desired_output">Desired output (optional)</Label>
        <Input
          id="desired_output"
          name="desired_output"
          placeholder="e.g. 1080×1080 PNG, safe for Facebook feed"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="hardware_tier_code">Hardware tier (optional)</Label>
        <select
          id="hardware_tier_code"
          name="hardware_tier_code"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          defaultValue=""
        >
          <option value="">Infer from goal text</option>
          {hardwareTiers.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-3 rounded-md border border-border/50 p-4">
        <legend className="px-1 text-sm font-medium">Constraints (optional)</legend>
        {COMMON_CONSTRAINTS.map((code) => {
          const ct = constraintByCode.get(code);
          if (!ct) return null;
          return (
            <div key={code} className="space-y-1">
              <Label htmlFor={`constraint_${code}`}>{ct.label}</Label>
              <Input
                id={`constraint_${code}`}
                name={`constraint_${code}`}
                placeholder={
                  code === "output_platform"
                    ? "e.g. Facebook"
                    : code === "hardware"
                      ? "e.g. RTX 3090"
                      : code === "model_family"
                        ? "e.g. Flux"
                        : code.endsWith("_available")
                          ? "yes / no"
                          : ""
                }
              />
            </div>
          );
        })}
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? "Building recommendation…" : "Create decision request"}
      </Button>
    </form>
  );
}
