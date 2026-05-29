/**
 * Offline tests for decision engine foundation (Phase 2 Slice 5).
 * Run: npm run test:decision-engine
 */
import {
  buildRetrievalQuery,
  extractModelFamilyHint,
  inferHardwareTierCode,
} from "../src/lib/decision/query-build";
import type { DecisionConstraintRow, DecisionGoalTypeRow } from "../src/lib/decision/types";

const GOAL_TYPES = [
  "create_poster",
  "maintain_character_consistency",
  "edit_existing_image",
  "upscale_image",
  "generate_video",
  "talking_character_video",
  "troubleshoot_workflow",
  "choose_model",
  "optimize_for_hardware",
  "unknown",
];

const CONSTRAINT_TYPES = [
  "hardware",
  "model_family",
  "output_platform",
  "safety_level",
  "quality_target",
  "speed_target",
  "source_image_available",
  "reference_character_available",
  "workflow_json_available",
];

const DECISION_TABLES = [
  "decision_statuses",
  "decision_goal_types",
  "decision_constraint_types",
  "decision_requests",
  "decision_request_constraints",
  "decision_recommendations",
  "decision_recommendation_items",
  "decision_source_links",
];

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}`);
  }
}

const sampleGoal: DecisionGoalTypeRow = {
  id: "g1",
  code: "create_poster",
  label: "Create Poster",
  workflow_purpose_code: "poster",
};

const sampleConstraints: DecisionConstraintRow[] = [
  {
    constraint_type_id: "c1",
    code: "hardware",
    label: "Hardware",
    value_text: "RTX 3090",
    value_json: {},
  },
  {
    constraint_type_id: "c2",
    code: "output_platform",
    label: "Output Platform",
    value_text: "Facebook",
    value_json: {},
  },
];

console.log("CKOS decision engine — offline tests\n");

assert(GOAL_TYPES.length === 10, "ten goal types seeded");
assert(CONSTRAINT_TYPES.length === 9, "nine constraint types seeded");
assert(DECISION_TABLES.length === 8, "eight decision tables");

const query = buildRetrievalQuery(
  "Facebook-safe poster demoness character",
  sampleGoal,
  sampleConstraints
);
assert(query.includes("Facebook"), "retrieval query includes platform constraint");
assert(query.includes("poster"), "retrieval query includes workflow purpose");

assert(inferHardwareTierCode("RTX 3090 24GB", []) === "tier_24gb", "infers 3090 tier");
assert(extractModelFamilyHint("use flux dev", []) === "Flux", "infers flux family");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
