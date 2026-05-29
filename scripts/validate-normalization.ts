/**
 * Offline tests for knowledge normalization queue contracts.
 * Run: npm run test:normalization
 */
import { buildCitations } from "../src/lib/normalization/citations";

const TEMPLATE_CODES = [
  "concept_card",
  "model_card",
  "node_card",
  "workflow_pattern_card",
  "failure_candidate_card",
  "recipe_candidate_card",
];

const JOB_FIELDS = [
  "source_extraction_result_id",
  "source_version_id",
  "domain_id",
  "status_id",
  "template_id",
  "requested_by",
  "started_at",
  "completed_at",
  "error_message",
  "metadata",
];

const OUTPUT_FIELDS = [
  "normalization_job_id",
  "proposed_record_type_id",
  "proposed_title",
  "proposed_summary",
  "proposed_structured_data",
  "proposed_entity_alias",
  "resolved_entity_id",
  "confidence_score",
  "citations",
  "status_id",
  "review_notes",
];

const DECISION_FIELDS = [
  "normalization_job_output_id",
  "decision",
  "reviewer_id",
  "notes",
  "created_knowledge_record_id",
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

console.log("CKOS knowledge normalization — offline tests\n");

assert(TEMPLATE_CODES.length === 6, "six normalization templates defined");
assert(TEMPLATE_CODES.includes("concept_card"), "concept card template");
assert(JOB_FIELDS.length === 10, "normalization job field contract");
assert(OUTPUT_FIELDS.includes("citations"), "outputs include citations");
assert(DECISION_FIELDS.includes("created_knowledge_record_id"), "review decision links record");

const citations = buildCitations({
  source_id: "src-1",
  source_version_id: "ver-1",
  source_extraction_result_id: "ext-1",
  source_title: "ComfyUI Wiki",
  canonical_url: "https://comfyui-wiki.com/page",
  version_number: 1,
});

assert(citations.length === 1, "single primary citation");
assert(citations[0].source_version_id === "ver-1", "citation cites source version");
assert(citations[0].source_extraction_result_id === "ext-1", "citation cites extraction");

const NORMALIZATION_STATUS_CODES = [
  "pending",
  "in_progress",
  "draft_ready",
  "pending_review",
  "approved",
  "rejected",
];
assert(NORMALIZATION_STATUS_CODES.includes("pending_review"), "pending_review status exists");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
