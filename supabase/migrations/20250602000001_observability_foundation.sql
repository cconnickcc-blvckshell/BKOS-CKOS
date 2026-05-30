-- CKOS Observability and Error Handling Foundation (additive only)

-- ---------------------------------------------------------------------------
-- Lookup: system event types
-- ---------------------------------------------------------------------------

CREATE TABLE public.system_event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Lookup: error categories
-- ---------------------------------------------------------------------------

CREATE TABLE public.error_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Lookup: structured error codes
-- ---------------------------------------------------------------------------

CREATE TABLE public.error_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  category_id UUID NOT NULL REFERENCES public.error_categories(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  likely_causes JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_fixes JSONB NOT NULL DEFAULT '[]'::jsonb,
  retryable BOOLEAN NOT NULL DEFAULT false,
  user_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX error_codes_category_idx ON public.error_codes (category_id);

-- ---------------------------------------------------------------------------
-- System events (pipeline audit trail)
-- ---------------------------------------------------------------------------

CREATE TABLE public.system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID REFERENCES public.knowledge_domains(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  event_type_id UUID NOT NULL REFERENCES public.system_event_types(id),
  severity TEXT NOT NULL CHECK (severity IN ('success', 'info', 'warning', 'failed')),
  message TEXT NOT NULL,
  error_code_id UUID REFERENCES public.error_codes(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX system_events_entity_idx ON public.system_events (entity_type, entity_id, created_at DESC);
CREATE INDEX system_events_severity_idx ON public.system_events (severity, created_at DESC);
CREATE INDEX system_events_created_idx ON public.system_events (created_at DESC);
CREATE INDEX system_events_error_code_idx ON public.system_events (error_code_id) WHERE error_code_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Job attempts (retry-safe tracking)
-- ---------------------------------------------------------------------------

CREATE TABLE public.job_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  job_id UUID NOT NULL,
  attempt_number INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('success', 'warning', 'failed', 'skipped', 'retryable')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  error_code_id UUID REFERENCES public.error_codes(id) ON DELETE SET NULL,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (job_type, job_id, attempt_number)
);

CREATE INDEX job_attempts_job_idx ON public.job_attempts (job_type, job_id, started_at DESC);
CREATE INDEX job_attempts_status_idx ON public.job_attempts (status, started_at DESC);

-- ---------------------------------------------------------------------------
-- Health check snapshots
-- ---------------------------------------------------------------------------

CREATE TABLE public.system_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'warning', 'failed', 'skipped')),
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX system_health_checks_code_idx ON public.system_health_checks (check_code, checked_at DESC);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_system_event_types_updated_at
  BEFORE UPDATE ON public.system_event_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_error_categories_updated_at
  BEFORE UPDATE ON public.error_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_error_codes_updated_at
  BEFORE UPDATE ON public.error_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.system_event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_event_types_read" ON public.system_event_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "error_categories_read" ON public.error_categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "error_codes_read" ON public.error_codes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "system_events_all" ON public.system_events
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "job_attempts_all" ON public.job_attempts
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "system_health_checks_all" ON public.system_health_checks
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

-- ---------------------------------------------------------------------------
-- Seeds: event types
-- ---------------------------------------------------------------------------

INSERT INTO public.system_event_types (code, label, sort_order, description) VALUES
  ('pipeline_started', 'Pipeline started', 10, 'Job or pipeline step began'),
  ('pipeline_succeeded', 'Pipeline succeeded', 20, 'Step completed successfully'),
  ('pipeline_failed', 'Pipeline failed', 30, 'Step failed with error code'),
  ('pipeline_skipped', 'Pipeline skipped', 40, 'Step skipped intentionally'),
  ('pipeline_retryable', 'Pipeline retryable', 50, 'Failed but safe to retry'),
  ('health_check', 'Health check', 60, 'System health probe'),
  ('configuration_warning', 'Configuration warning', 70, 'Missing or disabled configuration')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seeds: error categories
-- ---------------------------------------------------------------------------

INSERT INTO public.error_categories (code, label, sort_order) VALUES
  ('configuration', 'Configuration', 10),
  ('authentication', 'Authentication', 20),
  ('supabase', 'Supabase', 30),
  ('network', 'Network', 40),
  ('trusted_domain', 'Trusted domain', 50),
  ('fetch', 'Fetch', 60),
  ('extraction', 'Extraction', 70),
  ('normalization', 'Normalization', 80),
  ('ai_provider', 'AI provider', 90),
  ('embedding_provider', 'Embedding provider', 100),
  ('workflow_analysis', 'Workflow analysis', 110),
  ('validation', 'Validation', 120),
  ('rls', 'Row-level security', 130),
  ('unknown', 'Unknown', 999)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seeds: error codes
-- ---------------------------------------------------------------------------

INSERT INTO public.error_codes (code, category_id, title, description, likely_causes, recommended_fixes, retryable, user_visible)
SELECT v.code, c.id, v.title, v.description, v.likely_causes::jsonb, v.recommended_fixes::jsonb, v.retryable, true
FROM (VALUES
  ('ENV_MISSING_SUPABASE_URL', 'configuration', 'Supabase URL missing', 'NEXT_PUBLIC_SUPABASE_URL is not set.',
    '["Environment file not copied","Variable not exported in shell"]',
    '["Copy .env.example to .env.local","Set NEXT_PUBLIC_SUPABASE_URL from supabase status"]', false),
  ('ENV_MISSING_SUPABASE_ANON_KEY', 'configuration', 'Supabase anon key missing', 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.',
    '["Keys not copied from Supabase dashboard or CLI"]',
    '["Run supabase status and paste anon key into .env.local"]', false),
  ('ENV_MISSING_SERVICE_ROLE_KEY', 'configuration', 'Service role key missing', 'SUPABASE_SERVICE_ROLE_KEY is not set for server tasks.',
    '["Optional key omitted for local dev"]',
    '["Add service role key only on server; never expose to client"]', false),
  ('AI_PROVIDER_DISABLED', 'ai_provider', 'AI provider disabled', 'AI_PROVIDER is set to disabled.',
    '["Intentional local-first setup","AI not configured yet"]',
    '["Set AI_PROVIDER to ollama, lmstudio, or openai_compatible","Continue with manual normalization"]', false),
  ('AI_PROVIDER_UNREACHABLE', 'ai_provider', 'AI provider unreachable', 'Could not reach the configured AI endpoint.',
    '["Ollama or LM Studio not running","Wrong AI_BASE_URL","Firewall blocking localhost"]',
    '["Start Ollama: ollama serve","Verify AI_BASE_URL matches your server","Check model is loaded"]', true),
  ('AI_PROVIDER_BAD_RESPONSE', 'ai_provider', 'AI provider bad response', 'The AI endpoint returned an invalid or empty response.',
    '["Model does not support JSON mode","Prompt too large","Provider error"]',
    '["Try a smaller source excerpt","Use a model with JSON output support","Check provider logs"]', true),
  ('EMBEDDING_PROVIDER_DISABLED', 'embedding_provider', 'Embedding provider disabled', 'EMBEDDING_PROVIDER is set to disabled.',
    '["Intentional local-first setup"]',
    '["Set EMBEDDING_PROVIDER for semantic search","Full-text search still works"]', false),
  ('EMBEDDING_PROVIDER_UNREACHABLE', 'embedding_provider', 'Embedding provider unreachable', 'Could not reach the embedding endpoint.',
    '["Ollama not running","Wrong EMBEDDING_BASE_URL"]',
    '["Start embedding service","Verify EMBEDDING_BASE_URL and model name"]', true),
  ('EMBEDDING_DIMENSION_MISMATCH', 'embedding_provider', 'Embedding dimension mismatch', 'Vector dimensions do not match stored embedding column.',
    '["EMBEDDING_DIMENSIONS differs from stored vectors","Model changed without rebuild"]',
    '["Set EMBEDDING_DIMENSIONS consistently","Rebuild embeddings for affected records"]', false),
  ('URL_NOT_TRUSTED', 'trusted_domain', 'URL not on trusted domain list', 'The hostname is not in trusted_source_domains.',
    '["Typo in domain","New source not allowlisted"]',
    '["Add domain via migration or admin","Use a URL from comfyui-wiki.com, docs.comfy.org, etc."]', false),
  ('ROBOTS_BLOCKED', 'fetch', 'Blocked by robots.txt', 'robots.txt disallows fetching this path.',
    '["Site policy blocks CKOS user agent","Path restricted"]',
    '["Try a different URL on the same domain","Respect site policy; do not bypass robots"]', false),
  ('FETCH_TIMEOUT', 'fetch', 'Fetch timed out', 'HTTP request exceeded fetch_timeout_ms.',
    '["Slow server","Network issue","Timeout too low"]',
    '["Retry later","Increase timeout in source_crawl_policies if appropriate"]', true),
  ('FETCH_HTTP_ERROR', 'fetch', 'HTTP error during fetch', 'Server returned a non-success HTTP status.',
    '["404 or 403 from source","Rate limiting"]',
    '["Verify URL is correct","Retry later if rate limited"]', true),
  ('FETCH_UNSUPPORTED_CONTENT_TYPE', 'fetch', 'Unsupported content type', 'Response Content-Type is not allowed for extraction.',
    '["Binary or PDF response","API returned application/json unexpectedly"]',
    '["Use an HTML or text documentation URL","Adjust allowed_content_types in crawl policy"]', false),
  ('EXTRACTION_EMPTY_CONTENT', 'extraction', 'Extraction produced no content', 'HTML/text extraction yielded empty markdown or text.',
    '["Empty page","JavaScript-only content","Paywall"]',
    '["Try another URL with static content","Review extraction in diagnostics"]', false),
  ('NORMALIZATION_SOURCE_MISSING', 'normalization', 'Normalization source missing', 'No source version or extraction linked to normalization job.',
    '["Fetch not completed","Job created before extraction"]',
    '["Run source fetch first","Re-create normalization job from campaign"]', false),
  ('NORMALIZATION_OUTPUT_INVALID', 'normalization', 'Invalid normalization output', 'Draft output failed validation before publish.',
    '["Missing title","Invalid structured_data","Failed quote verification"]',
    '["Edit draft in normalization UI","Regenerate AI drafts if needed"]', false),
  ('WORKFLOW_JSON_INVALID', 'workflow_analysis', 'Invalid workflow JSON', 'Workflow JSON could not be parsed or is missing nodes.',
    '["Corrupt export","Wrong file uploaded","Not ComfyUI format"]',
    '["Re-export workflow from ComfyUI","Validate JSON in a linter"]', false),
  ('WORKFLOW_ANALYSIS_FAILED', 'workflow_analysis', 'Workflow analysis failed', 'Analysis pipeline could not score or persist workflow.',
    '["Missing lookup seeds","Database error during persist"]',
    '["Check system events","Re-run analyze from workflow detail"]', true),
  ('SUPABASE_RLS_DENIED', 'rls', 'Permission denied (RLS)', 'Row-level security blocked this operation.',
    '["Not signed in","created_by mismatch","Policy too strict"]',
    '["Sign in again","Ensure server action sets created_by to auth.uid()"]', false),
  ('SUPABASE_RPC_FAILED', 'supabase', 'Supabase RPC failed', 'A database RPC returned an error.',
    '["Migration not applied","Function signature mismatch"]',
    '["Run supabase db reset or migration up","Check Postgres logs"]', true),
  ('UNKNOWN_ERROR', 'unknown', 'Unknown error', 'An unexpected error occurred.',
    '["Unhandled exception","Third-party failure"]',
    '["Copy diagnostic summary","Check system events for details"]', true)
) AS v(code, cat_code, title, description, likely_causes, recommended_fixes, retryable)
JOIN public.error_categories c ON c.code = v.cat_code
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  likely_causes = EXCLUDED.likely_causes,
  recommended_fixes = EXCLUDED.recommended_fixes,
  retryable = EXCLUDED.retryable;

DO $$
DECLARE active_id UUID;
BEGIN
  SELECT public.active_status_id() INTO active_id;
  UPDATE public.system_event_types SET status = active_id WHERE status IS NULL;
  UPDATE public.error_categories SET status = active_id WHERE status IS NULL;
  UPDATE public.error_codes SET status = active_id WHERE status IS NULL;
END $$;
