# Phase 2 Stabilization Report

**Audit date:** 2026-05-29  
**Branch audited:** `cursor/phase-2-slice8-source-discovery-d003` (cumulative stack for PRs #1–#13)  
**Stabilization integration branch:** `cursor/phase-2-stabilization-d003`  
**Rules:** No new features, architecture, agents, or autonomous crawling.

---

## Executive summary

| Area | Result |
|------|--------|
| PR stack (#2–#13) | **Documented merge order**; cumulative code on slice8 branch; **not merged to `main` on GitHub** until stabilization PR lands |
| Fresh DB reset + migrations | **Blocked in cloud agent** (no Docker). **Static migration order: PASS** (15 files, 84 tables). Live apply requires `supabase db reset` locally |
| Offline test suites (12) | **111/111 assertions PASS** |
| `npm run build` | **PASS** (28 app routes compiled) |
| Sidebar routes | **16/16** nav hrefs have matching `page.tsx` (static) |
| Runtime UI / RLS / E2E | **Requires** `.env.local` + Supabase + auth user + optional `OPENAI_API_KEY` |
| Recommended before Phase 3 | See [Recommended fixes](#recommended-fixes-before-phase-3) |

---

## 1. PR merge / rebase order (#2 through #13)

Stacked branches are **linear**; each PR branch contains all prior commits. Merge order:

| Order | PR | Branch | Scope |
|------:|-----|--------|--------|
| 1 | #1 | `cursor/ckos-phase1-foundation-d003` | Phase 1 foundation |
| 2 | #2 | `cursor/phase-15-slice1-entities-d003` | Canonical entities |
| 3 | #3 | `cursor/phase-15-slice2-workflow-intelligence-d003` | Workflows |
| 4 | #4 | `cursor/phase-15-slice3-failure-intelligence-d003` | Failures |
| 5 | #5 | `cursor/phase-15-slice4-recipe-inheritance-d003` | Recipes |
| 6 | #6 | `cursor/phase-2-slice1-source-acquisition-d003` | Acquisition |
| 7 | #7 | `cursor/phase-2-slice2-normalization-queue-d003` | Normalization queue |
| 8 | #8 | `cursor/phase-2-slice3-embeddings-d003` | Embeddings |
| 9 | #9 | `cursor/phase-2-slice4-ai-normalization-d003` | AI drafts |
| 10 | #10 | `cursor/phase-2-slice5-decision-engine-d003` | Decision engine |
| 11 | #11 | `cursor/phase-2-slice6-curation-campaigns-d003` | Curation |
| 12 | #12 | `cursor/phase-2-slice7-knowledge-gaps-d003` | Knowledge gaps |
| 13 | #13 | `cursor/phase-2-slice8-source-discovery-d003` | Source discovery |

**Stabilization action:** Merge `cursor/phase-2-stabilization-d003` → `main` (equivalent to merging #1–#13 in sequence). Close or rebase individual draft PRs after `main` is updated.

**Note:** `main` currently has only the initial commit (`7d5a043`). All application code lives on feature branches until stabilization merge.

---

## 2. Migration verification

### 2.1 File order (apply exactly as filename sort)

1. `20250529000001_ckos_foundation.sql`
2. `20250529000002_ckos_rls_search.sql`
3. `20250529100001_phase_15_slice1_canonical_entities.sql`
4. `20250529100002_phase_15_slice1_resolver_tests.sql` (SQL assertions in `DO $$` block)
5. `20250529110001_phase_15_slice2_workflow_intelligence.sql`
6. `20250529120001_phase_15_slice3_failure_intelligence.sql`
7. `20250529130001_phase_15_slice4_recipe_inheritance.sql`
8. `20250530100001_phase_2_slice1_source_acquisition.sql`
9. `20250531100001_phase_2_slice2_normalization_queue.sql`
10. `20250531120001_phase_2_slice3_embeddings_automation.sql`
11. `20250531140001_phase_2_slice4_ai_normalization.sql`
12. `20250531160001_phase_2_slice5_decision_engine.sql`
13. `20250531180001_phase_2_slice6_curation_campaigns.sql`
14. `20250531200001_phase_2_slice7_knowledge_gaps.sql`
15. `20250531220001_phase_2_slice8_source_discovery.sql`

### 2.2 Static dependency check

```bash
npx tsx scripts/verify-migration-order.ts
```

**Result:** 15/15 files pass FK/table reference ordering (84 tables total).

### 2.3 Live database reset

**Cloud agent:** `npx supabase db reset --local` failed — Docker not available.

**Recommended local command:**

```bash
cp .env.example .env.local   # fill Supabase + OpenAI keys
npx supabase start           # requires Docker
npx supabase db reset
```

Post-reset checks:

```sql
SELECT COUNT(*) FROM supabase_migrations.schema_migrations;  -- expect 15
SELECT symptom FROM failure_records WHERE symptom = 'Face Drift';
SELECT code FROM normalization_statuses WHERE code = 'succeeded';
SELECT * FROM resolve_entity_alias('comfyui', 'Flux Kontext');
```

### 2.4 Cross-slice dependency notes

| Dependency | Detail |
|------------|--------|
| Slice 4 AI runs | Requires `normalization_statuses.code = 'succeeded'` seeded in slice 4 migration |
| Slice 8 discovery | Requires `knowledge_gaps`, `curation_campaigns`, `trusted_source_domains` from slices 6–7 and 1 |
| Slice 6 curation batch | Calls slice 1 `runSourceFetch`, slice 2 normalization, slice 3 embeddings |
| `vector` extension | Created in foundation; HNSW index on `embeddings` |
| Resolver tests | Migration `100002` fails fast if entity seeds missing — must run after `100001` |

---

## 3. Test summary

| Script | Assertions | Result |
|--------|------------|--------|
| `npm run test:entities` | 9 | PASS |
| `npm run test:workflows` | 12 | PASS |
| `npm run test:failures` | 8 | PASS |
| `npm run test:recipes` | 17 | PASS |
| `npm run test:acquisition` | 17 | PASS |
| `npm run test:normalization` | 9 | PASS |
| `npm run test:embeddings` | 6 | PASS |
| `npm run test:ai-normalization` | 11 | PASS |
| `npm run test:decision-engine` | 7 | PASS |
| `npm run test:curation-campaigns` | 6 | PASS |
| `npm run test:knowledge-gaps` | 5 | PASS |
| `npm run test:source-discovery` | 4 | PASS |
| `npm run build` | — | PASS |
| `npx tsx scripts/verify-migration-order.ts` | 15 | PASS |

**Total offline assertions:** 111 passed, 0 failed.

**Gap:** No integration/E2E test runner (Playwright/Cypress). All DB/RLS/UI flows require manual or scripted runs against a live Supabase project.

---

## 4. Sidebar route verification (static)

| Nav href | Page | Status |
|----------|------|--------|
| `/dashboard` | `(cockpit)/dashboard/page.tsx` | OK |
| `/knowledge` | `knowledge/page.tsx` | OK |
| `/entities` | `entities/page.tsx` | OK |
| `/sources` | `sources/page.tsx` | OK |
| `/acquisition` | `acquisition/page.tsx` | OK |
| `/normalization` | `normalization/page.tsx` | OK |
| `/curation` | `curation/page.tsx` | OK |
| `/gaps` | `gaps/page.tsx` | OK |
| `/discovery` | `discovery/page.tsx` | OK |
| `/embeddings` | `embeddings/page.tsx` | OK |
| `/workflows` | `workflows/page.tsx` | OK |
| `/failures` | `failures/page.tsx` | OK |
| `/recipes` | `recipes/page.tsx` | OK |
| `/search` | `search/page.tsx` | OK |
| `/graph` | `graph/page.tsx` | OK |
| `/decision` | `decision/page.tsx` | OK |

**Runtime caveat:** Without `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY`, middleware skips auth redirect logic but pages that query Supabase will error at data-fetch time.

---

## 5. RLS verification (code review)

### 5.1 Pattern

Most mutable tables use:

```sql
FOR ALL TO authenticated
USING (true)
WITH CHECK (created_by = auth.uid() OR created_by IS NULL);
```

Decision requests additionally allow `requested_by = auth.uid()`.

### 5.2 Tables with permissive `WITH CHECK (true)`

- `curation_campaign_sources`, `curation_campaign_outputs`
- `knowledge_gap_evidence`, `campaign_gap_links`, `entity_gap_links`
- Several decision child tables

**Risk:** Any authenticated user can insert rows without `created_by` alignment on child tables. Acceptable for single-tenant MVP; tighten for multi-tenant Phase 3.

### 5.3 Application alignment

Server actions and libs generally set `created_by: user.id` on inserts (curation, normalization, acquisition, gaps, discovery, decision). **Verify at runtime** that service-role paths are not used from the browser.

### 5.4 Runtime RLS checklist (manual)

1. Sign up / log in as User A.
2. Create curation campaign — expect success.
3. Sign in as User B — confirm User A campaigns visible (current `USING (true)` — **document as known open read policy**).
4. Insert normalization job without session — expect failure.

---

## 6. End-to-end campaign walkthrough: Flux Kontext Mastery

**Status:** Procedure validated against code paths; **not executed live** in cloud agent (no `.env.local`, no CKOS-dedicated Supabase project, no OpenAI key).

### 6.1 Prerequisites

- Migrations applied (`supabase db reset`).
- `.env.local` with Supabase URL, anon key, `OPENAI_API_KEY` (for AI draft + embeddings).
- Authenticated user in app.

### 6.2 Create campaign

1. `/curation/new`
2. Title: **Flux Kontext Mastery**
3. Domain: **comfyui** (or matching `knowledge_domains.code`)
4. Objective: Master FLUX Kontext editing workflows, VRAM constraints, and common failures.
5. Status: **active**
6. Save → note `campaign_id`

### 6.3 Five trusted URLs (comfyui-wiki.com)

Add each via **Add URL to campaign** on `/curation/[id]`:

| # | URL (verify live before production) |
|---|-------------------------------------|
| 1 | `https://comfyui-wiki.com/en/tutorial/advanced/image/flux/flux-1-kontext-dev` |
| 2 | `https://comfyui-wiki.com/en/tutorial/advanced/image/flux/flux-1-kontext` |
| 3 | `https://comfyui-wiki.com/en/tutorial/advanced/image/flux/flux-1-kontext-multi-image` |
| 4 | `https://comfyui-wiki.com/en/tutorial/advanced/image/flux/flux-1-kontext-pro` |
| 5 | `https://comfyui-wiki.com/en/tutorial/advanced/image/flux/flux-1-kontext-dev-basic-workflow` |

If any 404, substitute another path under `comfyui-wiki.com/en/tutorial/.../flux/`.

### 6.4 Pipeline steps

| Step | UI / action | Expected outcome |
|------|-------------|------------------|
| Fetch | **Fetch all pending URLs** | `source_fetch_jobs` → succeeded; extractions created |
| Normalize | **Create normalization jobs** | Jobs `pending_review` / `draft_ready` |
| AI draft | `/normalization/[id]` → **Generate AI Drafts** | `normalization_ai_runs` → succeeded; outputs `is_ai_proposal` |
| Approve | Review each output → **Approve** | `knowledge_records` created |
| Embed | **Process embeddings** on campaign | `embedding_jobs` succeeded; campaign outputs synced |
| Search | `/search` query `Flux Kontext VRAM` | Semantic hits on approved knowledge |
| Gaps | `/gaps` → analyze campaign | Gaps linked via `campaign_gap_links` |
| Discovery | `/discovery` → suggest for gap/campaign | Suggestions `pending_review` |
| Approve source | Approve one suggestion → **Add to campaign** | New `curation_campaign_sources` row; **no auto-fetch** |
| Decision | `/decision/new` goal e.g. `model_selection` + constraints `platform=facebook`, `hardware=rtx_3090` | Recommendation items from retrieval |

### 6.5 Decision engine smoke query

After knowledge exists for `flux_kontext` entity (seeded in entities migration):

- Goal: **workflow_design** or **model_selection**
- Constraints: `target_platform=facebook`, `max_vram_gb=24`
- Expect retrieval query to include platform + FLUX family hints (`build-recommendation.ts`).

---

## 7. Gap analysis (from walkthrough design)

| Gap type | Example | Evidence |
|----------|---------|----------|
| Missing normalization | Wiki page fetched but not approved | Campaign metrics: pending_review count > 0 |
| Thin embeddings | Approved record with failed embed job | `embedding_jobs.status = failed` |
| Entity coverage | `flux_kontext` entity exists but few aliases | Gap analyzer: `entity_coverage` |
| Failure mode | No linked failure for “VRAM OOM” | `failure_mode` gap type |
| Discovery | Search-only suggestions for gaps | `suggestion_source` = campaign_gap_analysis |

---

## 8. Source suggestions (example)

After gap analysis on **Flux Kontext Mastery**, discovery may propose:

- Wiki search URLs: `https://comfyui-wiki.com/en/search?query=...` (from `suggest-for-gap.ts`)
- docs.comfy.org paths when gap title matches doc patterns

**Approve one** → adds URL to campaign only; operator must **Fetch** manually (by design).

---

## 9. Bug list

| ID | Severity | Area | Description |
|----|----------|------|-------------|
| B-01 | **High** | Release | `main` lacks all CKOS code; production deploy from `main` would be empty |
| B-02 | **High** | Infra | Cloud CI/agents cannot run `supabase db reset` without Docker |
| B-03 | **Medium** | Auth | Middleware no-ops when env missing — routes appear reachable but data layer fails |
| B-04 | **Medium** | RLS | Global `USING (true)` on campaigns/knowledge — no per-org isolation |
| B-05 | **Medium** | RLS | Child tables (`curation_campaign_sources`) allow `WITH CHECK (true)` |
| B-06 | **Low** | Decision | `searchRecipes` selects `objective` — column exists only after slice 4 migration (OK post-reset, fails if slice 4 skipped) |
| B-07 | **Low** | Discovery | Dedupe index `UNIQUE (normalized_url, COALESCE(gap_id, campaign_id))` — edge case if both gap and campaign set |
| B-08 | **Low** | UX | `/search` is static prerender — may not reflect auth-specific results in build output |
| B-09 | **Info** | Tests | No `test:all` npm script; 12 separate commands |
| B-10 | **Info** | npm | `npm audit` reports dependency vulnerabilities (not Phase 2 scoped) |

---

## 10. Friction points

1. **12 separate test commands** — easy to miss one before release.
2. **Manual campaign pipeline** — five URLs × (fetch → normalize → AI → approve → embed) is many clicks; batch actions help but approval remains per job.
3. **OPENAI_API_KEY required** for AI drafts and embeddings — failures surface as job `failed` without prominent UI remediation text.
4. **Trusted domain only** — typos in URL host fail at add-url with domain error.
5. **Discovery suggestions** are often search URLs, not deep links — operator must curate.
6. **Stacked draft PRs (#2–#13)** — reviewing slice-by-slice is redundant; prefer one stabilization merge PR.
7. **No dedicated CKOS Supabase project** in org — use new project or `Blvckshell` (inactive) with full reset.

---

## 11. Missing indexes / slow query risks

| Table / query | Concern | Recommendation |
|---------------|---------|----------------|
| `knowledge_records` FTS + vector | Heavy combined search | Monitor `match_embeddings` + `search_vector` on >10k rows |
| `curation_campaign_sources` | Filter by `campaign_id` + status | Index exists (`campaign_idx`) — OK |
| `source_discovery_suggestions` | Dedupe + status filters | Indexes on gap/campaign/status — OK |
| `normalization_job_outputs` | Large JSON per job | Paginate UI; archive old jobs |
| `audit_logs` | Unbounded growth | Retention policy before Phase 3 |
| `embedding_jobs` queue polling | List page may scan all org jobs | Add partial index on `(status_id) WHERE code = 'pending'` if slow |

---

## 12. Schema concerns (no new tables unless blocking)

1. **`status` vs domain-specific status tables** — many modules; ensure app never hardcodes UUIDs (uses lookup helpers — OK).
2. **`recipes.goal` vs `recipes.objective`** — dual columns; inheritance uses both; prefer single canonical field in Phase 3 cleanup.
3. **`normalization_statuses.succeeded`** vs **`acquisition_statuses.succeeded`** — same code, different tables (intentional).
4. **Postgres 17** on Supabase vs local Docker **15** — test migrations on target major version.
5. **Vector dimension 1536** — locked to `text-embedding-3-small`; model change requires migration.

---

## 13. Recommended fixes before Phase 3

### Blocking

1. **Merge stabilization branch to `main`** and tag release `phase-2-stable`.
2. **Provision CKOS Supabase project**; run full `supabase db reset`; store keys in CI secrets.
3. **Execute E2E walkthrough once** on staging with real URLs and capture screenshots/logs.

### High priority

4. Add `npm run test:all` chaining all 12 validators + migration script.
5. Add CI job: `supabase db reset` + resolver migration + `npm run build` + `test:all`.
6. Document required env vars in README (fail fast if missing in dev).

### Medium priority

7. Tighten RLS for multi-tenant: `organization_id` + `auth.uid()` on read policies.
8. Set `created_by` on all child inserts (`curation_campaign_sources`).
9. Prominent error UI when `OPENAI_API_KEY` missing for AI/embed actions.

### Low priority / Phase 3

10. Consolidate `recipes.goal` / `objective`.
11. Playwright smoke for sidebar + login redirect.
12. `audit_logs` retention.

---

## 14. Deliverables checklist

| Deliverable | Location |
|-------------|----------|
| Stabilization report | `docs/PHASE_2_STABILIZATION_REPORT.md` (this file) |
| Bug list | Section 9 |
| Migration verification | Section 2 + `scripts/verify-migration-order.ts` |
| Test summary | Section 3 |
| E2E walkthrough | Section 6 |
| Recommended fixes | Section 13 |

---

## 15. Agent environment notes

- **Docker:** not installed — local Supabase stack unavailable.
- **`.env.local`:** not present (only `.env.example`).
- **MCP Supabase:** `Blvckshell_Ai_Studio` project was empty; partial test migration was applied and **rolled back** during audit. **Do not use unrelated projects for CKOS** without explicit reset approval.

---

*End of Phase 2 stabilization audit.*
