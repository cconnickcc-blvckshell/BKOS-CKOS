-- CKOS Phase 2 Slice 4: AI-assisted draft normalization (additive only)

-- ---------------------------------------------------------------------------
-- AI provider configs
-- ---------------------------------------------------------------------------

CREATE TABLE public.ai_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  max_tokens INT NOT NULL DEFAULT 4096,
  temperature NUMERIC(3, 2) NOT NULL DEFAULT 0.2,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (provider, model)
);

-- ---------------------------------------------------------------------------
-- Prompt templates (database-driven)
-- ---------------------------------------------------------------------------

CREATE TABLE public.prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  normalization_template_id UUID REFERENCES public.normalization_templates(id) ON DELETE SET NULL,
  ai_provider_config_id UUID REFERENCES public.ai_provider_configs(id) ON DELETE SET NULL,
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  response_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- AI runs (audit trail; never auto-publishes)
-- ---------------------------------------------------------------------------

CREATE TABLE public.normalization_ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalization_job_id UUID NOT NULL REFERENCES public.normalization_jobs(id) ON DELETE CASCADE,
  ai_provider_config_id UUID NOT NULL REFERENCES public.ai_provider_configs(id),
  prompt_template_id UUID NOT NULL REFERENCES public.prompt_templates(id),
  status_id UUID NOT NULL REFERENCES public.normalization_statuses(id),
  raw_response JSONB,
  parsed_output_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX normalization_ai_runs_job_idx
  ON public.normalization_ai_runs (normalization_job_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Extend normalization outputs for AI drafts
-- ---------------------------------------------------------------------------

ALTER TABLE public.normalization_job_outputs
  ADD COLUMN IF NOT EXISTS extraction_notes TEXT,
  ADD COLUMN IF NOT EXISTS source_quote_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS normalization_ai_run_id UUID REFERENCES public.normalization_ai_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_ai_proposal BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX normalization_job_outputs_ai_run_idx
  ON public.normalization_job_outputs (normalization_ai_run_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_ai_provider_configs_updated_at
  BEFORE UPDATE ON public.ai_provider_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_prompt_templates_updated_at
  BEFORE UPDATE ON public.prompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_normalization_ai_runs_updated_at
  BEFORE UPDATE ON public.normalization_ai_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.ai_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalization_ai_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_provider_configs_read" ON public.ai_provider_configs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "prompt_templates_read" ON public.prompt_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "normalization_ai_runs_all" ON public.normalization_ai_runs
  FOR ALL TO authenticated USING (true) WITH CHECK (requested_by = auth.uid() OR created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- AI run lifecycle status (additive)
-- ---------------------------------------------------------------------------

INSERT INTO public.normalization_statuses (code, label, sort_order, description) VALUES
  ('succeeded', 'Succeeded', 25, 'AI run completed successfully')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------

INSERT INTO public.ai_provider_configs (provider, model, is_active, max_tokens, temperature)
VALUES ('openai', 'gpt-4o-mini', true, 4096, 0.2)
ON CONFLICT (provider, model) DO UPDATE SET is_active = true;

INSERT INTO public.prompt_templates (
  code, label, description, normalization_template_id, system_prompt, user_prompt_template, response_schema, sort_order
)
SELECT
  pt.code,
  pt.label,
  pt.description,
  nt.id,
  pt.system_prompt,
  pt.user_prompt_template,
  pt.response_schema,
  pt.sort_order
FROM (VALUES
  (
    'concept_card_extractor',
    'Concept Card Extractor',
    'Propose concept/technique knowledge cards from source text',
    'concept_card',
    'You are a CKOS knowledge extraction assistant for ComfyUI documentation. You ONLY propose draft knowledge records. You never publish or assert facts without quoting the source. Return valid JSON only.',
    E'Extract one or more concept card drafts from the source below.\n\nNormalization template: {{template_label}}\nDomain: {{domain_code}}\nSource title: {{source_title}}\n\nReturn JSON: { "proposals": [ { "proposed_title", "proposed_summary", "proposed_structured_data": { "concept", "key_points", "see_also" }, "proposed_entity_alias", "confidence_score": 0-1, "extraction_notes", "source_quote_refs": [ { "quote": "verbatim excerpt", "context": "why this supports the claim" } ] } ] }\n\nRules:\n- Every factual claim needs a verbatim source_quote_refs quote from the source text.\n- If you cannot find supporting text, set confidence_score <= 0.35 and explain in extraction_notes.\n- Propose 1-3 cards maximum. Do not invent URLs or version numbers.\n\n--- SOURCE ---\n{{source_text}}\n--- END ---',
    '{"type":"object","required":["proposals"]}'::jsonb,
    10
  ),
  (
    'model_card_extractor',
    'Model Card Extractor',
    'Propose model/checkpoint card drafts',
    'model_card',
    'You are a CKOS knowledge extraction assistant. Propose draft model cards only. Quote the source for every claim. JSON only.',
    E'Extract model card draft(s) from the source.\n\nTemplate: {{template_label}}\nDomain: {{domain_code}}\n\nJSON schema: proposals[] with proposed_title, proposed_summary, proposed_structured_data { model_family, parameters, license, recommended_use }, proposed_entity_alias, confidence_score, extraction_notes, source_quote_refs[{quote,context}].\n\n--- SOURCE ---\n{{source_text}}\n--- END ---',
    '{"type":"object","required":["proposals"]}'::jsonb,
    20
  ),
  (
    'node_card_extractor',
    'Node Card Extractor',
    'Propose ComfyUI node card drafts',
    'node_card',
    'You are a CKOS knowledge extraction assistant. Propose draft node cards only. Every parameter claim must cite source text. JSON only.',
    E'Extract node card draft(s).\n\nTemplate: {{template_label}}\n\nReturn proposals[] with structured_data { node_class, category, inputs, outputs }.\n\n--- SOURCE ---\n{{source_text}}\n--- END ---',
    '{"type":"object","required":["proposals"]}'::jsonb,
    30
  ),
  (
    'workflow_pattern_extractor',
    'Workflow Pattern Extractor',
    'Propose workflow pattern card drafts',
    'workflow_pattern_card',
    'You are a CKOS knowledge extraction assistant. Propose workflow pattern drafts only. Quote source. JSON only.',
    E'Extract workflow pattern draft(s).\n\nTemplate: {{template_label}}\n\nstructured_data: { pattern, nodes_involved, when_to_use }\n\n--- SOURCE ---\n{{source_text}}\n--- END ---',
    '{"type":"object","required":["proposals"]}'::jsonb,
    40
  ),
  (
    'failure_candidate_extractor',
    'Failure Candidate Extractor',
    'Propose failure candidate drafts',
    'failure_candidate_card',
    'You are a CKOS knowledge extraction assistant. Propose failure symptom drafts only. Quote source. JSON only.',
    E'Extract failure candidate draft(s).\n\nstructured_data: { symptom, likely_causes, detection_hints }\n\n--- SOURCE ---\n{{source_text}}\n--- END ---',
    '{"type":"object","required":["proposals"]}'::jsonb,
    50
  ),
  (
    'recipe_candidate_extractor',
    'Recipe Candidate Extractor',
    'Propose recipe candidate drafts',
    'recipe_candidate_card',
    'You are a CKOS knowledge extraction assistant. Propose recipe candidate drafts only. Quote source. JSON only.',
    E'Extract recipe candidate draft(s).\n\nstructured_data: { recipe_hint, steps_outline, constraints_hint }\n\n--- SOURCE ---\n{{source_text}}\n--- END ---',
    '{"type":"object","required":["proposals"]}'::jsonb,
    60
  )
) AS pt(code, label, description, nt_code, system_prompt, user_prompt_template, response_schema, sort_order)
JOIN public.normalization_templates nt ON nt.code = pt.nt_code
WHERE NOT EXISTS (SELECT 1 FROM public.prompt_templates p WHERE p.code = pt.code);

DO $$
DECLARE
  active_id UUID;
  provider_id UUID;
BEGIN
  SELECT public.active_status_id() INTO active_id;
  SELECT id INTO provider_id FROM public.ai_provider_configs WHERE is_active = true LIMIT 1;
  UPDATE public.ai_provider_configs SET status = active_id WHERE status IS NULL;
  UPDATE public.prompt_templates SET status = active_id WHERE status IS NULL;
  UPDATE public.prompt_templates SET ai_provider_config_id = provider_id
  WHERE ai_provider_config_id IS NULL AND provider_id IS NOT NULL;
END $$;
