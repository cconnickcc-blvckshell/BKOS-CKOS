-- Local-first AI and embedding provider seeds (env-driven runtime; DB for FKs and admin UI)

-- ---------------------------------------------------------------------------
-- Embedding: provider_disabled status
-- ---------------------------------------------------------------------------

INSERT INTO public.embedding_statuses (code, label, sort_order, description) VALUES
  ('provider_disabled', 'Provider Disabled', 55, 'Embedding provider disabled via EMBEDDING_PROVIDER=disabled')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Deactivate legacy OpenAI-only defaults
-- ---------------------------------------------------------------------------

UPDATE public.ai_provider_configs SET is_active = false WHERE provider = 'openai';
UPDATE public.embedding_model_configs SET is_active = false WHERE provider = 'openai';

-- ---------------------------------------------------------------------------
-- AI provider options (disabled active by default; env selects runtime)
-- ---------------------------------------------------------------------------

INSERT INTO public.ai_provider_configs (provider, model, is_active, max_tokens, temperature, metadata) VALUES
  ('disabled', 'none', true, 0, 0, '{"description":"AI disabled — manual normalization only"}'::jsonb),
  ('openai_compatible', 'qwen', false, 4000, 0.2, '{"description":"Any OpenAI-compatible chat API (LM Studio, vLLM, local Qwen)"}'::jsonb),
  ('ollama', 'qwen2.5:14b-instruct', false, 4000, 0.2, '{"description":"Ollama local models"}'::jsonb),
  ('lmstudio', 'qwen', false, 4000, 0.2, '{"description":"LM Studio OpenAI-compatible server"}'::jsonb),
  ('openai', 'gpt-4o-mini', false, 4096, 0.2, '{"description":"Optional legacy OpenAI cloud","legacy":true}'::jsonb)
ON CONFLICT (provider, model) DO UPDATE SET metadata = EXCLUDED.metadata;

UPDATE public.ai_provider_configs SET is_active = false;
UPDATE public.ai_provider_configs SET is_active = true WHERE provider = 'disabled' AND model = 'none';

-- ---------------------------------------------------------------------------
-- Embedding model options
-- ---------------------------------------------------------------------------

INSERT INTO public.embedding_model_configs (provider, model, dimensions, is_active, max_input_tokens, metadata) VALUES
  ('disabled', 'none', 768, true, 0, '{"description":"Embeddings disabled — full-text search only"}'::jsonb),
  ('openai_compatible', 'text-embedding-model', 768, false, 8192, '{"description":"OpenAI-compatible embedding endpoint"}'::jsonb),
  ('ollama', 'nomic-embed-text', 768, false, 8192, '{"description":"Ollama nomic-embed-text"}'::jsonb),
  ('lmstudio', 'text-embedding-model', 768, false, 8192, '{"description":"LM Studio embeddings"}'::jsonb),
  ('openai', 'text-embedding-3-small', 1536, false, 8192, '{"description":"Optional legacy OpenAI embeddings","legacy":true}'::jsonb)
ON CONFLICT (provider, model) DO UPDATE SET
  metadata = EXCLUDED.metadata,
  dimensions = EXCLUDED.dimensions;

UPDATE public.embedding_model_configs SET is_active = false WHERE provider <> 'disabled';
UPDATE public.embedding_model_configs SET is_active = true WHERE provider = 'disabled' AND model = 'none';

-- Link prompt templates to disabled provider when no config set
DO $$
DECLARE
  disabled_ai_id UUID;
BEGIN
  SELECT id INTO disabled_ai_id FROM public.ai_provider_configs
  WHERE provider = 'disabled' AND model = 'none' LIMIT 1;

  IF disabled_ai_id IS NOT NULL THEN
    UPDATE public.prompt_templates
    SET ai_provider_config_id = disabled_ai_id
    WHERE ai_provider_config_id IS NULL
       OR ai_provider_config_id IN (
         SELECT id FROM public.ai_provider_configs WHERE provider = 'openai' AND is_active = false
       );
  END IF;
END $$;
