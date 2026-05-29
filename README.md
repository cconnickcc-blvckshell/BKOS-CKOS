# CKOS — Comfy Knowledge Operating System

Production-grade knowledge operating system for AI image and video generation. CKOS is the first domain module of the **Blvckshell Knowledge OS** — structured intelligence, not chat.

## Phase 1 (current)

- Supabase authentication
- Normalized Postgres schema with pgvector
- Source management with version history
- Knowledge records and relationships
- ComfyUI workflow JSON ingestion
- Hybrid semantic search
- Knowledge cockpit UI (dashboard, explorers, relationship graph)

## Phase 1.5 Slice 1 (canonical entities)

- `knowledge_domains`, `entity_types`, `entities`, `entity_aliases`
- `knowledge_records.entity_id` + `domain_id` bridges on core tables
- Database resolver: `resolve_entity_alias(domain, text)`
- Entity explorer UI + knowledge record assignment
- Validation: `npm run test:entities` (offline) + SQL tests in migration `20250529100002`

## Phase 1.5 Slice 2 (workflow intelligence)

- Lookup tables: `workflow_purposes`, `complexity_levels`, `hardware_tiers`, `workflow_purpose_signals`
- `workflow_edges`, `workflow_analysis` with JSONB scoring breakdown
- Deterministic analysis on ingest + **Re-analyze** action
- See `docs/WORKFLOW_ANALYSIS_SCORING.md` · `npm run test:workflows`

## Phase 1.5 Slice 3 (failure intelligence)

- `severity_levels`, `failure_categories`, `failure_causes`, `failure_fixes`
- `workflow_failure_links`, `knowledge_failure_links`
- Extended `failure_records` (domain + entity aware; legacy JSONB preserved)
- Failure Explorer UI with create/edit, causes, fixes, and linking
- See `docs/FAILURE_INTELLIGENCE.md` · `npm run test:failures`

## Phase 2 Slice 2 (knowledge normalization queue)

- `normalization_statuses`, `normalization_templates`, `normalization_jobs`, `normalization_job_outputs`, `normalization_review_decisions`
- Manual draft editor, approve/reject workflow, published `knowledge_records` with `source_version_id` attribution
- Entity alias resolution via existing `resolve_entity_alias` RPC
- See `docs/KNOWLEDGE_NORMALIZATION.md` · `npm run test:normalization`

## Phase 2 Slice 1 (source acquisition)

- `acquisition_statuses`, `trusted_source_domains`, `source_crawl_policies`
- `source_fetch_jobs`, `source_extraction_results`, immutable `source_versions` snapshots
- Trusted-domain fetch + HTML/text extraction + review UI
- See `docs/SOURCE_ACQUISITION.md` · `npm run test:acquisition`

## Phase 1.5 Slice 4 (recipe inheritance)

- `recipe_categories`, `recipe_variant_types`, extended `recipes` with parent/child inheritance
- `recipe_versions`, `recipe_steps`, `recipe_dependencies`, knowledge/workflow/failure links
- Deterministic inheritance resolver + Recipe Explorer UI (create/edit, resolved detail view)
- See `docs/RECIPE_INHERITANCE.md` · `npm run test:recipes`

## Stack

- Next.js 15 · TypeScript · Tailwind · shadcn/ui
- Supabase (Postgres + Auth + pgvector) — single source of truth

## Quick start

### 1. Supabase project

Create a project at [supabase.com](https://supabase.com), then apply migrations:

```bash
npx supabase link --project-ref YOUR_REF
npx supabase db push
```

Or run the SQL in `supabase/migrations/` via the Supabase SQL editor.

### 2. Environment

```bash
cp .env.example .env.local
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Optional: `OPENAI_API_KEY` for embedding generation (semantic search).

### 3. Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create an account, and enter the cockpit.

## Architecture

| Module | Tables | Phase |
|--------|--------|-------|
| Source Acquisition | `sources`, `source_versions`, `source_types` | 1 |
| Knowledge Normalization | `knowledge_records`, `knowledge_types` | 1 |
| Knowledge Graph | `knowledge_relationships`, `relationship_types` | 1 |
| Workflow Intelligence | `workflows`, `workflow_nodes`, `workflow_categories` | 1 |
| Failure Analysis | `failure_records` | Schema ready |
| Studio Recipes | `recipes` | Schema ready |
| Decision Engine | — | Phase 2 |
| Vector Search | `embeddings`, `hybrid_search_knowledge`, `match_embeddings` | 1 |

All categories, types, and statuses are **database-driven** — nothing hardcoded in application logic.

## Database design

Every entity table includes: `created_at`, `updated_at`, `created_by`, `version`, `status` (FK to `status_types`). Organizations and RBAC hooks are prepared for multi-tenant expansion.

## License

Proprietary — Blvckshell / BKOS-CKOS
