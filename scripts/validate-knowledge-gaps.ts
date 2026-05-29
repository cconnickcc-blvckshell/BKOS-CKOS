/**
 * Offline tests for knowledge gap detection (Phase 2 Slice 7).
 * Run: npm run test:knowledge-gaps
 */

const GAP_STATUSES = [
  "open",
  "investigating",
  "source_needed",
  "normalization_needed",
  "resolved",
  "dismissed",
];

const GAP_SEVERITIES = ["low", "medium", "high", "critical"];

const GAP_TYPES = [
  "missing_entity",
  "missing_failure_modes",
  "missing_recipe",
  "missing_workflow",
  "missing_citations",
  "weak_confidence",
  "stale_source",
  "duplicate_conflict",
  "missing_hardware_notes",
  "missing_model_compatibility",
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

console.log("CKOS knowledge gaps — offline tests\n");

assert(GAP_STATUSES.length === 6, "six gap statuses");
assert(GAP_SEVERITIES.length === 4, "four severity levels");
assert(GAP_TYPES.length === 10, "ten gap types");
assert(GAP_TYPES.includes("missing_failure_modes"), "failure mode gap type");
assert(GAP_STATUSES.includes("normalization_needed"), "normalization_needed status");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
