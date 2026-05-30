/**
 * Observability foundation — offline tests
 * Run: npm run test:observability
 */
import { AppError, errorFromUnknown, mapFetchErrorToCode } from "../src/lib/observability/app-error";
import { ErrorCodes } from "../src/lib/observability/error-codes";
import { redactString, redactMetadata } from "../src/lib/observability/redact";
import { formatDiagnosticSummary } from "../src/lib/observability/diagnostics";

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

console.log("CKOS observability — offline tests\n");

const err = new AppError({
  code: ErrorCodes.URL_NOT_TRUSTED,
  userMessage: "Domain is not trusted.",
  technicalDetail: "evil.example.com",
  retryable: false,
  recommendedNextStep: "Use comfyui-wiki.com",
});
assert(err.code === ErrorCodes.URL_NOT_TRUSTED, "AppError carries code");
assert(err.retryable === false, "AppError retryable flag");
assert(err.userMessage.includes("trusted"), "AppError user message");

const fromNet = errorFromUnknown(new Error("timeout"), ErrorCodes.UNKNOWN_ERROR);
assert(fromNet.code === ErrorCodes.UNKNOWN_ERROR, "errorFromUnknown fallback code");

assert(
  mapFetchErrorToCode("Blocked by robots.txt", null) === ErrorCodes.ROBOTS_BLOCKED,
  "mapFetchErrorToCode robots"
);
assert(
  mapFetchErrorToCode("HTTP 404 Not Found", 404) === ErrorCodes.FETCH_HTTP_ERROR,
  "mapFetchErrorToCode http"
);
assert(
  mapFetchErrorToCode("Unsupported content type: application/pdf", 200) ===
    ErrorCodes.FETCH_UNSUPPORTED_CONTENT_TYPE,
  "mapFetchErrorToCode content type"
);

const redacted = redactString("Authorization: Bearer sk-abc123456789012345678901234");
assert(redacted.includes("[REDACTED]"), "redactString masks bearer token");
assert(
  (redactMetadata({ api_key: "secret", note: "ok" }).api_key as string) === "[REDACTED]",
  "redactMetadata masks api_key"
);

const summary = formatDiagnosticSummary({
  title: "Test",
  status: "failed",
  errorCode: ErrorCodes.AI_PROVIDER_DISABLED,
  userMessage: "AI off",
  sections: [{ title: "A", items: [{ label: "x", value: "1" }] }],
});
assert(summary.includes("AI_PROVIDER_DISABLED"), "diagnostic summary includes code");
assert(summary.includes("AI off"), "diagnostic summary includes message");

const requiredCodes = [
  "ENV_MISSING_SUPABASE_URL",
  "AI_PROVIDER_DISABLED",
  "EMBEDDING_PROVIDER_DISABLED",
  "URL_NOT_TRUSTED",
  "ROBOTS_BLOCKED",
  "WORKFLOW_JSON_INVALID",
  "UNKNOWN_ERROR",
];
for (const c of requiredCodes) {
  assert(
    Object.values(ErrorCodes).includes(c as (typeof ErrorCodes)[keyof typeof ErrorCodes]),
    `ErrorCodes defines ${c}`
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
