# Source acquisition (Phase 2 Slice 1)

CKOS can fetch **single pages** from **trusted domains** on user request, store an **immutable** raw snapshot in `source_versions`, and persist **structured extraction** in `source_extraction_results` for human review before normalization.

## Principles

- **User-submitted URLs only** — no blind or recursive crawling
- **Trusted allowlist** — domains loaded from `trusted_source_domains`
- **Server-side fetch** — no client-side bypass of policy
- **Robots.txt** — respected when `source_crawl_policies.respect_robots_txt` is true (default)
- **No paywall bypass** — standard HTTP GET only; failures surface as job errors
- **Audit trail** — `write_audit_log` on fetch start, failure, and completion
- **Immutable versions** — DB trigger blocks mutation of snapshot fields on `source_versions`

## Tables

| Table | Role |
|-------|------|
| `acquisition_statuses` | Job and review lifecycle (pending, in_progress, succeeded, failed, pending_review, …) |
| `trusted_source_domains` | Allowlist with optional subdomain matching |
| `source_crawl_policies` | Per-domain timeout, size cap, User-Agent, content types, robots flag |
| `source_fetch_jobs` | One row per fetch attempt |
| `source_extraction_results` | Structured extraction tied 1:1 to `source_version_id` |
| `source_versions` | Extended with `raw_snapshot`, `snapshot_content_type`, `source_fetch_job_id` |

## Extraction output

The extractor (`src/lib/acquisition/extractor.ts`) produces:

- Title, canonical URL, summary
- Headings, links, code blocks, image metadata (JSONB)
- `extracted_markdown` and `extracted_text` for review UI

## UI

| Route | Purpose |
|-------|---------|
| `/acquisition` | Dashboard of fetch jobs + trusted domains |
| `/acquisition/new` | Add URL and fetch (create source + run job) |
| `/sources/[id]` | Manual fetch button + latest extraction review |

## Trusted domains (seed)

- comfyui-wiki.com
- docs.comfy.org
- github.com
- raw.githubusercontent.com
- huggingface.co
- arxiv.org

## Tests

```bash
npm run test:acquisition
```

## Out of scope

- Normalization into `knowledge_records`
- Agents, auto-crawl, site maps
- AI summarization
