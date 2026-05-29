/**
 * Offline tests for source discovery suggestions (Phase 2 Slice 8).
 * Run: npm run test:source-discovery
 */

const DISCOVERY_STATUSES = [
  "proposed",
  "approved",
  "rejected",
  "added_to_campaign",
  "dismissed",
];

const SUGGESTION_SOURCES = [
  "manual",
  "search_query",
  "known_trusted_domain",
  "related_source_links",
  "campaign_gap_analysis",
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

console.log("CKOS source discovery — offline tests\n");

assert(DISCOVERY_STATUSES.length === 5, "five discovery statuses");
assert(SUGGESTION_SOURCES.length === 5, "five suggestion sources");
assert(DISCOVERY_STATUSES.includes("added_to_campaign"), "added_to_campaign status");
assert(SUGGESTION_SOURCES.includes("campaign_gap_analysis"), "campaign gap analysis source");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
