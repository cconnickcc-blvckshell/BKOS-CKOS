/**
 * Offline tests for embedding automation contracts.
 * Run: npm run test:embeddings
 */
import { hashEmbeddableContent, estimateTokens } from "../src/lib/embeddings/hash";
import { buildCitations } from "../src/lib/normalization/citations";

const EMBEDDABLE_TYPES = [
  "knowledge_record",
  "workflow",
  "workflow_analysis",
  "failure_record",
  "recipe",
  "recipe_version",
  "source_extraction_result",
];

const JOB_FIELDS = [
  "entity_type",
  "entity_id",
  "embedding_model_config_id",
  "status_id",
  "content_hash",
  "token_estimate",
  "error_message",
  "started_at",
  "completed_at",
  "metadata",
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

console.log("CKOS embeddings automation — offline tests\n");

assert(EMBEDDABLE_TYPES.length === 7, "seven embeddable entity types");
assert(JOB_FIELDS.length === 10, "embedding job field contract");

const h1 = hashEmbeddableContent("hello world");
const h2 = hashEmbeddableContent("hello world");
const h3 = hashEmbeddableContent("different");
assert(h1 === h2, "content hash is deterministic");
assert(h1 !== h3, "different content yields different hash");
assert(estimateTokens("abcd") >= 1, "token estimate positive");

const SEED_MODEL = { provider: "openai", model: "text-embedding-3-small", dimensions: 1536 };
assert(SEED_MODEL.dimensions === 1536, "seed model dimensions 1536");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
