# Embeddings automation (Phase 2 Slice 3)

| Table | Purpose |
|-------|---------|
| `embedding_statuses` | pending, in_progress, succeeded, failed, skipped, **provider_disabled** |
| `embedding_model_configs` | Provider/model/dimensions (seed; env drives runtime) |
| `embedding_jobs` | Queue with content-hash idempotency |
| `embeddings` | Stored vectors (1536-dim column; local dims padded) |

## Provider

Set `EMBEDDING_PROVIDER` in `.env.local`:

- `disabled` — jobs finalize as **provider_disabled**; full-text search still works.
- `ollama` — `http://localhost:11434/api/embeddings`
- `lmstudio` / `openai_compatible` — `/v1/embeddings`
- `openai` — optional legacy cloud

## Flow

1. Approved knowledge (and other embeddable types) enqueue jobs.
2. Content hash skips unchanged work.
3. Adapter generates vector; stored padded to 1536 if needed.
4. Semantic search uses vectors when present; otherwise hybrid/FTS fallback.

## Tests

```bash
npm run test:embeddings
npm run test:local-providers
```
