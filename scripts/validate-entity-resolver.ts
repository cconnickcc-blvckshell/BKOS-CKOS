/**
 * Offline validation for entity alias normalization.
 * Mirrors public.normalize_entity_alias() in Postgres.
 *
 * Run: npm run test:entities
 */
import { normalizeEntityAlias } from "../src/lib/entities/normalize-alias";

type Case = {
  input: string;
  expected: string | null;
  label: string;
};

const cases: Case[] = [
  { input: "  Open  Pose!!  ", expected: "open pose", label: "Open Pose spacing" },
  { input: "OpenPose", expected: "openpose", label: "OpenPose single token" },
  {
    input: "OpenPose ControlNet",
    expected: "openpose controlnet",
    label: "OpenPose ControlNet phrase",
  },
  {
    input: "openpose_controlnet",
    expected: "openpose controlnet",
    label: "slug with underscores",
  },
  { input: "flux.1 dev", expected: "flux1 dev", label: "flux punctuation" },
  { input: "   ", expected: null, label: "empty whitespace" },
  { input: "FLUX Dev", expected: "flux dev", label: "FLUX Dev casing" },
];

let passed = 0;
let failed = 0;

console.log("CKOS entity alias normalization — offline tests\n");

for (const c of cases) {
  const actual = normalizeEntityAlias(c.input);
  const ok = actual === c.expected;
  if (ok) {
    passed++;
    console.log(`  ✓ ${c.label}`);
  } else {
    failed++;
    console.log(`  ✗ ${c.label}`);
    console.log(`      input:    ${JSON.stringify(c.input)}`);
    console.log(`      expected: ${JSON.stringify(c.expected)}`);
    console.log(`      actual:   ${JSON.stringify(actual)}`);
  }
}

// Slug bridge helper (matches SQL slug_exact branch)
function normalizedToSlug(normalized: string): string {
  return normalized.replace(/ /g, "_");
}

const slugCases = [
  { alias: "openpose controlnet", slug: "openpose_controlnet" },
  { alias: "openpose_controlnet", slug: "openpose_controlnet" },
];

console.log("\nSlug bridge checks (TS helper for slug_exact parity):\n");

for (const c of slugCases) {
  const norm = normalizeEntityAlias(c.alias);
  const bridged = norm ? normalizedToSlug(norm) : null;
  const ok = bridged === c.slug;
  if (ok) {
    passed++;
    console.log(`  ✓ "${c.alias}" → ${c.slug}`);
  } else {
    failed++;
    console.log(`  ✗ "${c.alias}" expected slug ${c.slug}, got ${bridged}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}

console.log(
  "\nFor database resolver tests, apply migrations and run:\n" +
    "  supabase db reset   # or: supabase migration up\n" +
    "  # Migration 20250529100002 runs SQL assertions automatically.\n" +
    "  # Or call: SELECT * FROM resolve_entity_alias('comfyui', 'Open Pose');\n"
);
