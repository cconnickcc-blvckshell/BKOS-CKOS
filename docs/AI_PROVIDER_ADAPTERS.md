# AI and embedding provider adapters

Runtime configuration is read from **environment variables**. Database seeds (`ai_provider_configs`, `embedding_model_configs`) exist for FKs and admin display; **env wins** for API calls.

## AI adapters

| `AI_PROVIDER` | Adapter | Endpoint style |
|---------------|---------|----------------|
| `disabled` | — | No calls; manual normalization only |
| `openai_compatible` | `chatCompletionsJson` | `{base}/v1/chat/completions` |
| `ollama` | `ollamaChatJson` | `/api/chat` or `/v1/chat/completions` if base contains `/v1` |
| `lmstudio` | `lmStudioChatJson` | OpenAI-compatible (default `http://localhost:1234/v1`) |
| `openai` | `openAiLegacyChatJson` | Optional cloud; `OPENAI_API_KEY` fallback |

Code: `src/lib/providers/ai/`

## Embedding adapters

| `EMBEDDING_PROVIDER` | Adapter | Endpoint style |
|----------------------|---------|----------------|
| `disabled` | — | Jobs → `provider_disabled`; FTS still works |
| `openai_compatible` | `openAiCompatibleEmbedding` | `{base}/v1/embeddings` |
| `ollama` | `ollamaEmbedding` | `/api/embeddings` or `/v1/embeddings` |
| `lmstudio` | `lmStudioEmbedding` | OpenAI-compatible |
| `openai` | `openAiLegacyEmbedding` | Optional cloud |

Code: `src/lib/providers/embedding/`

## Storage dimensions

The `embeddings.embedding` column is `vector(1536)`. Local models (768-dim) are **zero-padded** to 1536 via `padEmbeddingForStorage`. Use the same provider and dimensions for indexing and queries.

## Tests

```bash
npm run test:local-providers
```
