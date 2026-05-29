-- CKOS Phase 2 Slice 3: Embeddings automation & retrieval hardening (additive only)

-- ---------------------------------------------------------------------------
-- Lookup: embedding statuses
-- ---------------------------------------------------------------------------

CREATE TABLE public.embedding_statuses (
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
-- Model configs (provider-driven; no TS enums)
-- ---------------------------------------------------------------------------

CREATE TABLE public.embedding_model_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INT NOT NULL DEFAULT 1536,
  is_active BOOLEAN NOT NULL DEFAULT false,
  max_input_tokens INT NOT NULL DEFAULT 8192,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (provider, model)
);

-- ---------------------------------------------------------------------------
-- Embedding jobs (queue)
-- ---------------------------------------------------------------------------

CREATE TABLE public.embedding_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  embedding_model_config_id UUID NOT NULL REFERENCES public.embedding_model_configs(id),
  status_id UUID NOT NULL REFERENCES public.embedding_statuses(id),
  content_hash TEXT NOT NULL,
  token_estimate INT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX embedding_jobs_entity_idx ON public.embedding_jobs (entity_type, entity_id);
CREATE INDEX embedding_jobs_status_idx ON public.embedding_jobs (status_id, created_at DESC);
CREATE INDEX embedding_jobs_pending_idx ON public.embedding_jobs (created_at)
  WHERE completed_at IS NULL;

-- ---------------------------------------------------------------------------
-- Extend embeddings store
-- ---------------------------------------------------------------------------

ALTER TABLE public.embeddings
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS embedding_model_config_id UUID REFERENCES public.embedding_model_configs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS dimensions INT,
  ADD COLUMN IF NOT EXISTS token_estimate INT;

CREATE INDEX embeddings_content_hash_idx ON public.embeddings (entity_type, entity_id, content_hash);

-- ---------------------------------------------------------------------------
-- Enriched semantic search
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.match_embeddings_enriched(
  query_embedding extensions.vector(1536),
  match_threshold FLOAT DEFAULT 0.35,
  match_count INT DEFAULT 25,
  filter_entity_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  embedding_id UUID,
  entity_type TEXT,
  entity_id UUID,
  content_text TEXT,
  similarity FLOAT,
  content_hash TEXT,
  embedding_model TEXT,
  provider TEXT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.id AS embedding_id,
    e.entity_type,
    e.entity_id,
    e.content_text,
    1 - (e.embedding <=> query_embedding) AS similarity,
    e.content_hash,
    e.embedding_model,
    e.provider
  FROM public.embeddings e
  WHERE e.embedding IS NOT NULL
    AND (filter_entity_types IS NULL OR e.entity_type = ANY(filter_entity_types))
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_embedding_statuses_updated_at
  BEFORE UPDATE ON public.embedding_statuses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_embedding_model_configs_updated_at
  BEFORE UPDATE ON public.embedding_model_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_embedding_jobs_updated_at
  BEFORE UPDATE ON public.embedding_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.embedding_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embedding_model_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embedding_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "embedding_statuses_read" ON public.embedding_statuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "embedding_model_configs_read" ON public.embedding_model_configs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "embedding_jobs_all" ON public.embedding_jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------

INSERT INTO public.embedding_statuses (code, label, sort_order, description) VALUES
  ('pending', 'Pending', 10, 'Queued, not processed'),
  ('in_progress', 'In Progress', 20, 'Embedding generation running'),
  ('succeeded', 'Succeeded', 30, 'Embedding stored'),
  ('failed', 'Failed', 40, 'Error during generation'),
  ('skipped', 'Skipped', 50, 'Unchanged content or intentionally skipped');

INSERT INTO public.embedding_model_configs (provider, model, dimensions, is_active, max_input_tokens)
VALUES ('openai', 'text-embedding-3-small', 1536, true, 8192)
ON CONFLICT (provider, model) DO UPDATE SET is_active = true, dimensions = 1536;

DO $$
DECLARE active_id UUID;
BEGIN
  SELECT public.active_status_id() INTO active_id;
  UPDATE public.embedding_statuses SET status = active_id WHERE status IS NULL;
  UPDATE public.embedding_model_configs SET status = active_id WHERE status IS NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.match_embeddings_enriched TO authenticated;
