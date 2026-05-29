/**
 * Offline tests for recipe inheritance resolver and schema contracts.
 * Run: npm run test:recipes
 */
import {
  buildAncestryChain,
  resolveRecipeInheritance,
  type RecipeRow,
  type RecipeStepRow,
} from "../src/lib/recipes/inheritance";

const CATEGORY_CODES = [
  "poster",
  "character_consistency",
  "video",
  "talking_character",
  "upscaling",
  "image_editing",
  "product_mockup",
  "social_media",
  "workflow_debugging",
  "research",
  "unknown",
];

const VARIANT_CODES = [
  "base",
  "facebook_safe",
  "telegram",
  "event",
  "merch",
  "cinematic",
  "fast_draft",
  "high_quality",
  "experimental",
];

const SEED_SLUGS = [
  "base_poster",
  "facebook_safe_poster",
  "character_consistency",
  "talking_character_video",
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

function row(
  id: string,
  title: string,
  parent: string | null,
  partial: Partial<RecipeRow> = {}
): RecipeRow {
  return {
    id,
    title,
    recipe_slug: id,
    objective: null,
    goal: null,
    description: null,
    constraints: {},
    default_parameters: {},
    quality_checks: {},
    safety_notes: null,
    inputs_schema: {},
    output_schema: {},
    parent_recipe_id: parent,
    ...partial,
  };
}

console.log("CKOS recipe inheritance — offline tests\n");

assert(CATEGORY_CODES.length === 11, "eleven recipe categories defined");
assert(VARIANT_CODES.length === 9, "nine variant types defined");
assert(CATEGORY_CODES.includes("unknown"), "unknown category exists");
assert(SEED_SLUGS.includes("base_poster"), "base_poster seed documented");
assert(SEED_SLUGS.includes("facebook_safe_poster"), "facebook_safe_poster seed documented");

const base = row("base", "Base Poster", null, {
  objective: "Produce poster",
  constraints: {
    min_resolution: "2048x2048",
    color_profile: "sRGB",
    safe_margins_pct: 5,
  },
  default_parameters: { cfg: 7, steps: 28 },
  quality_checks: { checks: ["no_text_garbage", "sharp_edges"] },
  safety_notes: "Verify licensed assets.",
});

const child = row("child", "Facebook Safe", "base", {
  constraints: {
    min_resolution: "1080x1080",
    max_file_mb: 8,
    platform: "facebook",
  },
  default_parameters: { cfg: 6.5 },
  quality_checks: { checks: ["safe_zone_compliance", "file_size_under_limit"] },
  safety_notes: "Follow Meta safe-zone guidelines.",
});

const byId = new Map<string, RecipeRow>([
  [base.id, base],
  [child.id, child],
]);

const chain = buildAncestryChain(child, byId);
assert(chain.length === 2, "ancestry chain has root and child");
assert(chain[0].id === "base", "root is oldest ancestor");

const stepsByRecipeId = new Map<string, RecipeStepRow[]>([
  [
    "base",
    [
      {
        step_number: 1,
        title: "Prepare canvas",
        instruction: "Set dimensions.",
        required: true,
        estimated_cost_level: "low",
        metadata: {},
        source_recipe_id: "base",
        is_override: false,
      },
      {
        step_number: 2,
        title: "Generate",
        instruction: "Run main pass.",
        required: true,
        estimated_cost_level: "medium",
        metadata: {},
        source_recipe_id: "base",
        is_override: false,
      },
    ],
  ],
  [
    "child",
    [
      {
        step_number: 3,
        title: "Compress for Meta",
        instruction: "Re-export under 8MB.",
        required: true,
        estimated_cost_level: null,
        metadata: {},
        source_recipe_id: "child",
        is_override: false,
      },
    ],
  ],
]);

const resolved = resolveRecipeInheritance(child, chain, stepsByRecipeId);

assert(
  resolved.resolved.constraints.min_resolution === "1080x1080",
  "child overrides min_resolution"
);
assert(
  resolved.resolved.constraints.color_profile === "sRGB",
  "parent color_profile inherited via deep merge"
);
assert(
  resolved.resolved.constraints.platform === "facebook",
  "child platform constraint present"
);
assert(resolved.resolved.default_parameters.cfg === 6.5, "child cfg overrides parent");
assert(resolved.resolved.default_parameters.steps === 28, "parent steps parameter inherited");
assert(resolved.resolved.steps.length === 3, "merged step list has three steps");
const step3 = resolved.resolved.steps.find((s) => s.step_number === 3);
assert(step3?.title === "Compress for Meta", "child step 3 title preserved");
assert(step3?.source_recipe_id === "child", "child owns step 3");
assert(
  resolved.provenance.some((p) => p.field === "constraints" && p.overridden_by_child),
  "constraints override tracked in provenance"
);

const versionFields = [
  "recipe_id",
  "version_number",
  "title",
  "objective",
  "steps_snapshot",
  "parameters_snapshot",
  "quality_checks_snapshot",
  "change_notes",
  "status",
];
assert(versionFields.length === 9, "recipe_versions field contract documented");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
