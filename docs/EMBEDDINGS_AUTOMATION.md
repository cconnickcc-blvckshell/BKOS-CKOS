# Embeddings automation (Phase 2 Slice 3)

CKOS queues and processes **embedding jobs** for all major knowledge-bearing entities. Jobs are **idempotent**: unchanged content (SHA-256 `content_hash`) skips re-embedding.

## Tables

| Table | Role |
|-------|------|
| `embedding_statuses` | pending, in_progress, succeeded, failed, skipped |
| `embedding_model_configs` | Provider/model/dimensions (seed: OpenAI `text-embedding-3-small`, 1536) |
| `embedding_jobs` | Queue + audit trail per embed attempt |
| `embeddings` | Extended with `content_hash`, `provider`, `dimensions`, `token_estimate`, `embedding_model_config_id` |

## Auto-enqueue triggers

| Event | Entity type |
|-------|-------------|
| Knowledge record created | `knowledge_record` |
| Normalization output approved | `knowledge_record` |
| Workflow created / re-analyzed | `workflow`, `workflow_analysis` |
| Failure created / updated | `failure_record` |
| Recipe version snapshot | `recipe_version`, `recipe` |
| Source extraction saved (reviewable) | `source_extraction_result` |

## Processing

1. `enqueueEmbeddingJob` builds text via `buildEmbeddableContent`, hashes content.
2. Skips if hash matches existing `embeddings.content_hash` (unless `forceRebuild`).
3. Inserts `embedding_jobs` row + audit `embedding_job_enqueue`.
4. If `OPENAI_API_KEY` is set, processes immediately; otherwise job stays **pending** with a clear message.
5. Upserts `embeddings` with model config metadata on success.

## UI

- `/embeddings` — job dashboard, process queue, manual generate/rebuild by entity UUID
- `/search` — enriched results: domain, entity/knowledge type, source citation, match reason

## Manual actions

- **Generate embeddings** — enqueue + process one entity
- **Rebuild embeddings** — force new job even if hash unchanged
- **Process pending queue** — batch up to 25 pending jobs

## Tests

```bash
npm run test:embeddings
```

## Future providers

Add rows to `embedding_model_configs` and extend `src/lib/embeddings/providers/` — no TypeScript enums required.
