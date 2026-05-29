export type DecisionGoalTypeRow = {
  id: string;
  code: string;
  label: string;
  workflow_purpose_code: string | null;
};

export type DecisionConstraintRow = {
  constraint_type_id: string;
  code: string;
  label: string;
  value_text: string | null;
  value_json: Record<string, unknown>;
};

export type RetrievedKnowledge = {
  id: string;
  title: string;
  summary: string | null;
  knowledge_types: { code: string; label: string } | null;
};

export type RetrievedWorkflow = {
  id: string;
  title: string;
  description: string | null;
  analysis: {
    id: string;
    hardware_requirement_id: string;
    workflow_purpose_id: string;
    complexity_score: number;
    hardware_tiers: { code: string; label: string; min_vram_gb: number };
    workflow_purposes: { code: string; label: string };
  } | null;
};

export type RetrievedRecipe = {
  id: string;
  title: string;
  objective: string | null;
};

export type RetrievedFailure = {
  id: string;
  title: string;
  summary: string | null;
};

export type BuildRecommendationResult = {
  recommendationId: string;
  confidence: number;
  statusCode: "recommendation_ready" | "insufficient_evidence";
  itemCount: number;
  linkCount: number;
};
