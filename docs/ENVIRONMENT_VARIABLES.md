# Environment variables

## App

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public app URL |

## Supabase

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Project API URL (local: `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server tasks | Service role (never expose to browser) |

## AI provider (draft normalization)

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_PROVIDER` | `disabled` | `disabled`, `openai_compatible`, `ollama`, `lmstudio`, `openai` |
| `AI_BASE_URL` | — | API base (e.g. `http://localhost:11434/v1`) |
| `AI_API_KEY` | empty | Provider API key (optional for local) |
| `AI_MODEL` | `qwen2.5:14b-instruct` | Model id |
| `AI_TEMPERATURE` | `0.2` | Sampling temperature |
| `AI_MAX_TOKENS` | `4000` | Max completion tokens |

When `AI_PROVIDER=disabled`, manual normalization works; **Generate AI Drafts** is disabled in the UI.

## Embedding provider (semantic search)

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_PROVIDER` | `disabled` | `disabled`, `openai_compatible`, `ollama`, `lmstudio`, `openai` |
| `EMBEDDING_BASE_URL` | — | API base |
| `EMBEDDING_API_KEY` | empty | Optional key |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model id |
| `EMBEDDING_DIMENSIONS` | `768` | Native dimensions (padded to 1536 in DB) |

When `EMBEDDING_PROVIDER=disabled`, jobs are marked **provider_disabled**; hybrid search falls back to **full-text**.

## Legacy OpenAI (optional)

`AI_PROVIDER=openai` and `EMBEDDING_PROVIDER=openai` may use `OPENAI_API_KEY` if `AI_API_KEY` / `EMBEDDING_API_KEY` are unset. **Not required** for local development.

## Not used as defaults

- `OPENAI_API_KEY` — optional legacy only
- `OPENAI_EMBEDDING_MODEL` — optional legacy only
- Vercel / Render — not required
