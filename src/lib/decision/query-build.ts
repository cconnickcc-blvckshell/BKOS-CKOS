import type { DecisionConstraintRow, DecisionGoalTypeRow } from "@/lib/decision/types";

/** Build a websearch query string from goal text and constraints (deterministic). */
export function buildRetrievalQuery(
  goalText: string,
  goalType: DecisionGoalTypeRow,
  constraints: DecisionConstraintRow[]
): string {
  const parts = [goalText.trim(), goalType.label];

  for (const c of constraints) {
    if (c.value_text?.trim()) {
      parts.push(`${c.label}: ${c.value_text.trim()}`);
    }
  }

  if (goalType.workflow_purpose_code) {
    parts.push(goalType.workflow_purpose_code.replace(/_/g, " "));
  }

  return parts.filter(Boolean).join(" ");
}

/** Map common GPU mentions to hardware_tier codes. */
export function inferHardwareTierCode(
  goalText: string,
  constraints: DecisionConstraintRow[]
): string | null {
  const hw = constraints.find((c) => c.code === "hardware");
  const blob = `${goalText} ${hw?.value_text ?? ""}`.toLowerCase();

  if (/3090|24\s*gb|a5000|4090.*24/.test(blob)) return "tier_24gb";
  if (/4080|4070 ti|16\s*gb|a4000/.test(blob)) return "tier_16gb";
  if (/4060|3060|12\s*gb/.test(blob)) return "tier_12gb";
  if (/8\s*gb|3050|2060/.test(blob)) return "tier_8gb";
  if (/48\s*gb|a6000|h100|a100/.test(blob)) return "tier_48gb";

  return null;
}

export function extractModelFamilyHint(
  goalText: string,
  constraints: DecisionConstraintRow[]
): string | null {
  const mf = constraints.find((c) => c.code === "model_family");
  if (mf?.value_text?.trim()) return mf.value_text.trim();

  const blob = goalText.toLowerCase();
  if (/\bflux\b/.test(blob)) return "Flux";
  if (/\bsd3|stable diffusion 3\b/.test(blob)) return "SD3";
  if (/\bsdxl\b/.test(blob)) return "SDXL";
  if (/\bsd1\.5|sd 1\.5\b/.test(blob)) return "SD1.5";

  return null;
}
