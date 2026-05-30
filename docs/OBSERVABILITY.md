# Observability and error handling

CKOS records **structured errors**, **system events**, and **job attempts** so pipeline failures are actionable without reading server logs.

## Tables

| Table | Purpose |
|-------|---------|
| `system_event_types` | Event taxonomy (pipeline_started, pipeline_failed, …) |
| `system_events` | Timestamped audit with severity and optional `error_code_id` |
| `error_categories` | configuration, fetch, ai_provider, … |
| `error_codes` | Stable codes with likely causes and recommended fixes |
| `job_attempts` | Per-job retry tracking with duration |
| `system_health_checks` | Snapshots from `/health` |

## Error codes

All errors use stable codes such as `URL_NOT_TRUSTED`, `ROBOTS_BLOCKED`, `AI_PROVIDER_DISABLED`, `EMBEDDING_PROVIDER_DISABLED`, `WORKFLOW_JSON_INVALID`. Seeds live in migration `20250602000001_observability_foundation.sql`.

## Code utilities

```typescript
import { AppError, ErrorCodes, logSystemEvent, recordJobAttempt } from "@/lib/observability";
```

- `AppError` — user-safe message, retryable flag, redacted metadata
- `errorFromUnknown()` — map exceptions (including RLS) to `AppError`
- `logSystemEvent()` — write `system_events`
- `recordJobAttempt()` — write `job_attempts`

## UI

- **`/health`** — Supabase, auth, AI/embedding providers, trusted domains, failed jobs
- **`/events`** — Filterable system event log
- **Diagnostics panels** — Acquisition (failed fetches), normalization, decision requests; “Copy diagnostic summary” for support

## Pipeline coverage

| Pipeline | Events & attempts | Diagnostics UI |
|----------|-------------------|----------------|
| Source acquisition | Yes | Acquisition dashboard |
| Normalization / AI drafts | Partial | Normalization job detail |
| Embedding jobs | Yes | Via job metadata + events |
| Decision engine | Events via actions | Decision request detail |
| Workflow analysis | Structured JSON errors | Workflow create |

## Tests

```bash
npm run test:observability
```

## Security

Secrets are redacted from metadata and diagnostic copy (API keys, JWTs, Bearer tokens).
