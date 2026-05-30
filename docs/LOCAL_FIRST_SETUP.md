# Local-first CKOS setup

CKOS runs locally with **Next.js** and **Supabase** (local CLI or hosted). AI and embeddings are **optional** and **env-driven** — no OpenAI, Vercel, or Render required.

## 1. Supabase

```bash
npx supabase start
npx supabase db reset
```

Copy keys from `supabase status` into `.env.local`.

## 2. Environment

```bash
cp .env.example .env.local
# or for a ready local AI profile:
cp .env.local.example .env.local
```

Default `.env.example` uses `AI_PROVIDER=disabled` and `EMBEDDING_PROVIDER=disabled` so the app runs without any AI stack.

## 3. Run CKOS

```bash
npm install
npm run dev
```

Open http://localhost:3000 — sign up, use acquisition, normalization (manual), curation, and **full-text** search.

## 4. Enable local AI drafts (optional)

### Ollama

```bash
ollama pull qwen2.5:14b-instruct
```

```env
AI_PROVIDER=ollama
AI_BASE_URL=http://localhost:11434
AI_MODEL=qwen2.5:14b-instruct
```

### LM Studio (OpenAI-compatible)

Start the local server on port 1234, then:

```env
AI_PROVIDER=lmstudio
AI_BASE_URL=http://localhost:1234/v1
AI_MODEL=your-loaded-model
```

### OpenAI-compatible (Qwen, vLLM, etc.)

```env
AI_PROVIDER=openai_compatible
AI_BASE_URL=http://localhost:1234/v1
AI_MODEL=qwen/qwen3-14b
```

## 5. Enable local embeddings (optional)

### Ollama

```bash
ollama pull nomic-embed-text
```

```env
EMBEDDING_PROVIDER=ollama
EMBEDDING_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
```

Vectors are padded to 1536 for the existing pgvector column; use a consistent `EMBEDDING_DIMENSIONS` for query and store.

### LM Studio / OpenAI-compatible

```env
EMBEDDING_PROVIDER=openai_compatible
EMBEDDING_BASE_URL=http://localhost:1234/v1
EMBEDDING_MODEL=text-embedding-model
```

## 6. Legacy OpenAI (optional)

```env
AI_PROVIDER=openai
AI_API_KEY=sk-...
EMBEDDING_PROVIDER=openai
EMBEDDING_API_KEY=sk-...
EMBEDDING_DIMENSIONS=1536
```

See `ENVIRONMENT_VARIABLES.md` and `AI_PROVIDER_ADAPTERS.md`.
