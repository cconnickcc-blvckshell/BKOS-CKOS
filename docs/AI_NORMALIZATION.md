# AI-assisted draft normalization (Phase 2 Slice 4)

AI proposes `normalization_job_outputs` only. Humans approve or reject before anything is published.

## Principles

- **Untrusted drafts** — `is_ai_proposal`, `source_quote_refs`, quote verification caps confidence.
- **Env-driven provider** — `AI_PROVIDER` selects adapter (disabled, Ollama, LM Studio, OpenAI-compatible, optional OpenAI cloud).
- **Graceful degradation** — with `AI_PROVIDER=disabled`, manual normalization works; UI shows “AI provider disabled”.

## Flow

1. Operator opens `/normalization/[id]`.
2. Optional: **Generate AI Drafts** (when `AI_PROVIDER` is configured).
3. Server loads `prompt_templates`, calls the configured adapter, inserts proposals.
4. Human reviews quotes and approves/rejects.

## Environment

See `ENVIRONMENT_VARIABLES.md`. Example (Ollama):

```env
AI_PROVIDER=ollama
AI_BASE_URL=http://localhost:11434
AI_MODEL=qwen2.5:14b-instruct
```

## Tables

| Table | Purpose |
|-------|---------|
| `ai_provider_configs` | Seed rows for FKs; runtime uses env |
| `prompt_templates` | Database-driven prompts |
| `normalization_ai_runs` | Audit trail per generation |

## Tests

```bash
npm run test:ai-normalization
npm run test:local-providers
```
