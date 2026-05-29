/**
 * Offline validation for failure intelligence schema contracts.
 * Run: npm run test:failures
 */

const SEVERITY_CODES = ["low", "medium", "high", "critical"];

const CATEGORY_CODES = [
  "anatomy",
  "identity_consistency",
  "controlnet",
  "lora",
  "model_loading",
  "missing_nodes",
  "vram",
  "sampling",
  "prompting",
  "upscaling",
  "video_motion",
  "video_identity",
  "workflow_validation",
  "output_quality",
  "unknown",
];

const SEED_SYMPTOMS = [
  "Face Drift",
  "Extra Fingers",
  "ControlNet Ignored",
  "VRAM Exhaustion",
  "Missing Custom Node",
  "Poster Text Garbage",
  "Video Flicker",
  "Identity Drift In Video",
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

console.log("CKOS failure intelligence — offline contract tests\n");

assert(SEVERITY_CODES.length === 4, "four severity levels defined");
assert(CATEGORY_CODES.length === 15, "fifteen failure categories defined");
assert(CATEGORY_CODES.includes("unknown"), "unknown category exists");
assert(SEED_SYMPTOMS.includes("Face Drift"), "Face Drift in seed list");
assert(SEED_SYMPTOMS.length === 8, "eight seeded failures documented");

// Required relational fields (documentation contract)
const failureRecordFields = [
  "domain_id",
  "entity_id",
  "severity_level_id",
  "category_id",
  "symptom",
  "description",
  "probability_score",
  "detection_signals",
  "analysis_metadata",
];
assert(
  failureRecordFields.includes("symptom") && failureRecordFields.includes("domain_id"),
  "failure_records extended field contract"
);

const causeFields = ["failure_id", "cause", "confidence_score", "evidence", "sort_order", "status"];
const fixFields = [
  "failure_id",
  "recommended_fix",
  "effectiveness_score",
  "risk_level",
  "notes",
  "sort_order",
  "status",
];
assert(causeFields.length === 6, "failure_causes field contract");
assert(fixFields.length === 7, "failure_fixes field contract");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

console.log(
  "\nAfter `supabase db push`, verify seeds:\n" +
    "  SELECT symptom FROM failure_records WHERE symptom = 'Face Drift';\n" +
    "  SELECT COUNT(*) FROM failure_causes fc JOIN failure_records fr ON fr.id = fc.failure_id WHERE fr.symptom = 'Face Drift';\n"
);
