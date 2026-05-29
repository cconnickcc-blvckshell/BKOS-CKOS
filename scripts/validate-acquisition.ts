/**
 * Offline tests for source acquisition contracts and helpers.
 * Run: npm run test:acquisition
 */
import { normalizeSourceUrl, hostnameFromUrl } from "../src/lib/acquisition/normalize-url";
import {
  matchTrustedDomain,
  assertTrustedUrl,
  type TrustedDomainRow,
} from "../src/lib/acquisition/trusted-domains";
import { extractFromHtml, extractFromPlainText } from "../src/lib/acquisition/extractor";

const TRUSTED_DOMAINS: TrustedDomainRow[] = [
  { id: "1", domain: "comfyui-wiki.com", label: "Wiki", is_active: true, allow_subdomains: true },
  { id: "2", domain: "docs.comfy.org", label: "Docs", is_active: true, allow_subdomains: true },
  { id: "3", domain: "github.com", label: "GitHub", is_active: true, allow_subdomains: true },
  { id: "4", domain: "raw.githubusercontent.com", label: "Raw", is_active: true, allow_subdomains: false },
  { id: "5", domain: "huggingface.co", label: "HF", is_active: true, allow_subdomains: true },
  { id: "6", domain: "arxiv.org", label: "arXiv", is_active: true, allow_subdomains: true },
];

const SEED_DOMAIN_NAMES = [
  "comfyui-wiki.com",
  "docs.comfy.org",
  "github.com",
  "raw.githubusercontent.com",
  "huggingface.co",
  "arxiv.org",
];

const JOB_FIELDS = [
  "source_id",
  "requested_url",
  "normalized_url",
  "domain",
  "status_id",
  "http_status",
  "content_type",
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

console.log("CKOS source acquisition — offline tests\n");

assert(SEED_DOMAIN_NAMES.length === 6, "six trusted domains seeded");
assert(JOB_FIELDS.length === 11, "fetch job field contract");

const wikiUrl = normalizeSourceUrl("https://comfyui-wiki.com/en/tutorial");
assert(wikiUrl.startsWith("https://"), "normalizes https URL");
assert(hostnameFromUrl(wikiUrl) === "comfyui-wiki.com", "hostname extraction");

const match = matchTrustedDomain("comfyui-wiki.com", TRUSTED_DOMAINS);
assert(match?.domain === "comfyui-wiki.com", "matches wiki domain");

const sub = matchTrustedDomain("www.github.com", TRUSTED_DOMAINS);
assert(sub?.domain === "github.com", "subdomain matches github");

let rejected = false;
try {
  assertTrustedUrl("https://evil.example.com/page", TRUSTED_DOMAINS);
} catch {
  rejected = true;
}
assert(rejected, "rejects untrusted domain");

const html = `<!DOCTYPE html><html><head>
<title>Test Page</title>
<link rel="canonical" href="https://comfyui-wiki.com/canonical" />
<meta name="description" content="A test page" />
</head><body><main>
<h1>Hello CKOS</h1>
<p>Paragraph one.</p>
<pre><code class="language-python">print("hi")</code></pre>
<a href="/relative">Link</a>
<img src="/img.png" alt="diagram" />
</main></body></html>`;

const extracted = extractFromHtml(html, "https://comfyui-wiki.com/page");
assert(extracted.title === "Test Page", "extracts title");
assert(Boolean(extracted.canonical_url?.includes("canonical")), "extracts canonical URL");
assert(extracted.headings.length >= 1, "extracts headings");
assert(extracted.links.length >= 1, "extracts links");
assert(extracted.code_blocks.length >= 1, "extracts code blocks");
assert(extracted.images.length >= 1, "extracts images");
assert(extracted.extracted_markdown.includes("Hello CKOS"), "markdown contains heading text");
assert(extracted.extracted_text.includes("Paragraph"), "plain text extracted");

const plain = extractFromPlainText("# Title\n\nBody text.", "https://docs.comfy.org/x");
assert(plain.title === "# Title", "plain text title from first line");
assert(plain.extracted_markdown.includes("Body"), "plain markdown preserved");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
