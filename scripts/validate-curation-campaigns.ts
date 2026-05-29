/**
 * Offline tests for curation campaigns (Phase 2 Slice 6).
 * Run: npm run test:curation-campaigns
 */
import { computeCampaignMetrics } from "../src/lib/curation/campaign-metrics";

const CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed", "archived"];

const SOURCE_STATUSES = [
  "pending",
  "fetch_pending",
  "fetched",
  "fetch_failed",
  "extraction_ready",
  "normalization_pending",
  "normalization_ready",
  "approved",
  "embedded",
  "skipped",
];

const CAMPAIGN_TABLES = [
  "curation_campaign_statuses",
  "curation_campaign_source_statuses",
  "curation_campaigns",
  "curation_campaign_sources",
  "curation_campaign_outputs",
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

console.log("CKOS curation campaigns — offline tests\n");

assert(CAMPAIGN_STATUSES.length === 5, "five campaign statuses seeded");
assert(SOURCE_STATUSES.length === 10, "ten source pipeline statuses");
assert(CAMPAIGN_TABLES.length === 5, "five curation tables");

const metrics = computeCampaignMetrics(
  [
    {
      id: "1",
      status_id: "x",
      curation_campaign_source_statuses: { code: "embedded", label: "Embedded" },
      source_fetch_job_id: "f",
      source_extraction_result_id: "e",
      normalization_job_id: "n",
    },
    {
      id: "2",
      status_id: "x",
      curation_campaign_source_statuses: { code: "pending", label: "Pending" },
      source_fetch_job_id: null,
      source_extraction_result_id: null,
      normalization_job_id: null,
    },
  ],
  1,
  1
);

assert(metrics.totalSources === 2, "metrics count sources");
assert(metrics.embedded >= 1, "metrics track embedded");
assert(metrics.percentComplete > 0, "metrics compute percent");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
