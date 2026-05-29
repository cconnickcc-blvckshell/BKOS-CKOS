/**
 * Offline deterministic tests for workflow analysis engine.
 * Run: npm run test:workflows
 */
import { analyzeWorkflow } from "../src/lib/workflows/analyze-workflow";
import { parseComfyWorkflow } from "../src/lib/workflows/parser";
import { computeGraphMetrics } from "../src/lib/workflows/graph-metrics";

const MOCK_COMPLEXITY_LEVELS = [
  { id: "1", code: "simple", label: "Simple", min_score: 0 },
  { id: "2", code: "intermediate", label: "Intermediate", min_score: 25 },
  { id: "3", code: "advanced", label: "Advanced", min_score: 50 },
  { id: "4", code: "expert", label: "Expert", min_score: 75 },
];

const MOCK_HARDWARE_TIERS = [
  { id: "1", code: "tier_8gb", label: "8GB", min_vram_gb: 8 },
  { id: "2", code: "tier_12gb", label: "12GB", min_vram_gb: 12 },
  { id: "3", code: "tier_16gb", label: "16GB", min_vram_gb: 16 },
  { id: "4", code: "tier_24gb", label: "24GB", min_vram_gb: 24 },
  { id: "5", code: "tier_48gb", label: "48GB+", min_vram_gb: 48 },
];

const MOCK_PURPOSE_SIGNALS = [
  { pattern: "ipadapter", weight: 3, workflow_purposes: { code: "character_consistency" } },
  { pattern: "wan", weight: 3, workflow_purposes: { code: "video" } },
  { pattern: "upscale", weight: 2.5, workflow_purposes: { code: "upscale" } },
  { pattern: "controlnet", weight: 1, workflow_purposes: { code: "image_editing" } },
];

const SIMPLE_TXT2IMG = {
  "3": {
    class_type: "KSampler",
    inputs: {
      model: ["4", 0],
      positive: ["6", 0],
      negative: ["7", 0],
      latent_image: ["5", 0],
    },
  },
  "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "flux1-dev.safetensors" } },
  "5": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 } },
  "6": { class_type: "CLIPTextEncode", inputs: { text: "portrait", clip: ["4", 1] } },
  "7": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["4", 1] } },
  "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
  "9": { class_type: "SaveImage", inputs: { images: ["8", 0] } },
};

const VIDEO_WORKFLOW = {
  "1": { class_type: "WanVideoModelLoader", inputs: {} },
  "2": { class_type: "WanVideoSampler", inputs: { model: ["1", 0] } },
  "3": { class_type: "VHS_VideoCombine", inputs: { images: ["2", 0] } },
};

const IPADAPTER_WORKFLOW = {
  "1": { class_type: "CheckpointLoaderSimple", inputs: {} },
  "2": { class_type: "IPAdapterApply", inputs: { model: ["1", 0] } },
  "3": { class_type: "KSampler", inputs: { model: ["2", 0] } },
};

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

console.log("CKOS workflow analysis — offline tests\n");

const parsedSimple = parseComfyWorkflow(SIMPLE_TXT2IMG);
assert(parsedSimple.node_count === 7, "simple workflow node count");
assert(parsedSimple.edges.length >= 5, "simple workflow extracts edges");

const metrics = computeGraphMetrics(
  parsedSimple.nodes.map((n) => n.node_key),
  parsedSimple.edges
);
assert(metrics.graph_depth >= 2, "simple workflow graph depth >= 2");
assert(metrics.branch_count >= 0, "branch count non-negative");

const simpleAnalysis = analyzeWorkflow(parsedSimple, {
  complexityLevels: MOCK_COMPLEXITY_LEVELS,
  hardwareTiers: MOCK_HARDWARE_TIERS,
  purposeSignals: MOCK_PURPOSE_SIGNALS,
});
assert(simpleAnalysis.model_count >= 1, "detects model loader");
assert(simpleAnalysis.complexity_score >= 0 && simpleAnalysis.complexity_score <= 100, "complexity 0-100");
assert(Boolean(simpleAnalysis.analysis_metadata.complexity_breakdown), "stores complexity breakdown");
assert(simpleAnalysis.hardware_tier_code.length > 0, "assigns hardware tier code");

const videoParsed = parseComfyWorkflow(VIDEO_WORKFLOW);
const videoAnalysis = analyzeWorkflow(videoParsed, {
  complexityLevels: MOCK_COMPLEXITY_LEVELS,
  hardwareTiers: MOCK_HARDWARE_TIERS,
  purposeSignals: MOCK_PURPOSE_SIGNALS,
});
assert(videoAnalysis.video_capable === true, "video workflow flagged");
assert(videoAnalysis.workflow_purpose_code === "video", "infers video purpose");

const ipaParsed = parseComfyWorkflow(IPADAPTER_WORKFLOW);
const ipaAnalysis = analyzeWorkflow(ipaParsed, {
  complexityLevels: MOCK_COMPLEXITY_LEVELS,
  hardwareTiers: MOCK_HARDWARE_TIERS,
  purposeSignals: MOCK_PURPOSE_SIGNALS,
});
assert(
  ipaAnalysis.workflow_purpose_code === "character_consistency",
  "infers character_consistency from IPAdapter"
);

const deterministicTwice = analyzeWorkflow(parsedSimple, {
  complexityLevels: MOCK_COMPLEXITY_LEVELS,
  hardwareTiers: MOCK_HARDWARE_TIERS,
  purposeSignals: MOCK_PURPOSE_SIGNALS,
});
assert(
  deterministicTwice.complexity_score === simpleAnalysis.complexity_score,
  "analysis is deterministic"
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

console.log(
  "\nSee docs/WORKFLOW_ANALYSIS_SCORING.md for full methodology.\n"
);
