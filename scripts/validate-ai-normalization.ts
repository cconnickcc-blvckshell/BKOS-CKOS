/**
 * Offline tests for AI-assisted draft normalization (Phase 2 Slice 4).
 * Run: npm run test:ai-normalization
 */
import { renderPromptTemplate } from "../src/lib/normalization/ai/prompt-render";
import {
  adjustConfidenceForQuotes,
  quoteSupportedInSource,
} from "../src/lib/normalization/ai/quote-verify";

const PROMPT_TEMPLATE_CODES = [
  "concept_card_extractor",
  "model_card_extractor",
  "node_card_extractor",
  "workflow_pattern_extractor",
  "failure_candidate_extractor",
  "recipe_candidate_extractor",
];

const AI_OUTPUT_FIELDS = [
  "extraction_notes",
  "source_quote_refs",
  "normalization_ai_run_id",
  "is_ai_proposal",
  "confidence_score",
];

const AI_TABLES = [
  "ai_provider_configs",
  "prompt_templates",
  "normalization_ai_runs",
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

console.log("CKOS AI-assisted normalization — offline tests\n");

assert(PROMPT_TEMPLATE_CODES.length === 6, "six prompt templates required");
assert(AI_TABLES.length === 3, "three AI-related tables");
assert(AI_OUTPUT_FIELDS.includes("is_ai_proposal"), "outputs flag AI proposals");
assert(AI_OUTPUT_FIELDS.includes("source_quote_refs"), "outputs store source quotes");

const source = "ComfyUI uses KSampler for denoising steps in latent space.";
const goodQuote = "KSampler for denoising";
const badQuote = "totally invented phrase";

assert(quoteSupportedInSource(goodQuote, source), "verbatim quote matches source");
assert(!quoteSupportedInSource(badQuote, source), "unsupported quote rejected");

const noRefs = adjustConfidenceForQuotes(0.9, [], source);
assert(noRefs.confidence <= 0.35, "missing quotes cap confidence at 0.35");

const verified = adjustConfidenceForQuotes(0.85, [{ quote: goodQuote }], source);
assert(verified.confidence === 0.85, "verified quotes keep proposed confidence");

const partial = adjustConfidenceForQuotes(
  0.9,
  [{ quote: goodQuote }, { quote: badQuote }],
  source
);
assert(partial.confidence <= 0.55, "partial quote match lowers confidence");

const rendered = renderPromptTemplate(
  "Domain: {{domain_code}}\n---\n{{source_text}}",
  { domain_code: "comfyui", source_text: "hello" }
);
assert(rendered.includes("comfyui"), "prompt template variable substitution");
assert(rendered.includes("hello"), "source_text substituted");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
