-- CKOS Phase 2 Slice 2: Knowledge Normalization Queue (additive only)

-- ---------------------------------------------------------------------------
-- Lookup: normalization statuses
-- ---------------------------------------------------------------------------

CREATE TABLE public.normalization_statuses (
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
-- Templates (database-driven; map to knowledge_types)
-- ---------------------------------------------------------------------------

CREATE TABLE public.normalization_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  knowledge_type_id UUID NOT NULL REFERENCES public.knowledge_types(id),
  schema_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_structured_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Normalization jobs
-- ---------------------------------------------------------------------------

CREATE TABLE public.normalization_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_extraction_result_id UUID NOT NULL REFERENCES public.source_extraction_results(id) ON DELETE CASCADE,
  source_version_id UUID NOT NULL REFERENCES public.source_versions(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES public.knowledge_domains(id),
  status_id UUID NOT NULL REFERENCES public.normalization_statuses(id),
  template_id UUID NOT NULL REFERENCES public.normalization_templates(id),
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX normalization_jobs_extraction_idx
  ON public.normalization_jobs (source_extraction_result_id);
CREATE INDEX normalization_jobs_status_idx ON public.normalization_jobs (status_id);

-- ---------------------------------------------------------------------------
-- Proposed outputs (draft knowledge — not published until approved)
-- ---------------------------------------------------------------------------

CREATE TABLE public.normalization_job_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalization_job_id UUID NOT NULL REFERENCES public.normalization_jobs(id) ON DELETE CASCADE,
  proposed_record_type_id UUID NOT NULL REFERENCES public.knowledge_types(id),
  proposed_title TEXT NOT NULL,
  proposed_summary TEXT,
  proposed_structured_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposed_entity_alias TEXT,
  resolved_entity_id UUID REFERENCES public.entities(id) ON DELETE SET NULL,
  confidence_score NUMERIC(4, 3) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  status_id UUID NOT NULL REFERENCES public.normalization_statuses(id),
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX normalization_job_outputs_job_idx
  ON public.normalization_job_outputs (normalization_job_id);

-- ---------------------------------------------------------------------------
-- Review decisions (immutable audit of human approve/reject)
-- ---------------------------------------------------------------------------

CREATE TABLE public.normalization_review_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalization_job_output_id UUID NOT NULL REFERENCES public.normalization_job_outputs(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reviewer_id UUID NOT NULL REFERENCES auth.users(id),
  notes TEXT,
  created_knowledge_record_id UUID REFERENCES public.knowledge_records(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX normalization_review_decisions_output_idx
  ON public.normalization_review_decisions (normalization_job_output_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_normalization_statuses_updated_at
  BEFORE UPDATE ON public.normalization_statuses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_normalization_templates_updated_at
  BEFORE UPDATE ON public.normalization_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_normalization_jobs_updated_at
  BEFORE UPDATE ON public.normalization_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_normalization_job_outputs_updated_at
  BEFORE UPDATE ON public.normalization_job_outputs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_normalization_review_decisions_updated_at
  BEFORE UPDATE ON public.normalization_review_decisions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.normalization_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalization_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalization_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalization_job_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalization_review_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "normalization_statuses_read" ON public.normalization_statuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "normalization_templates_read" ON public.normalization_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "normalization_jobs_all" ON public.normalization_jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "normalization_job_outputs_all" ON public.normalization_job_outputs
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "normalization_review_decisions_all" ON public.normalization_review_decisions
  FOR ALL TO authenticated USING (true) WITH CHECK (reviewer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------

INSERT INTO public.normalization_statuses (code, label, sort_order, description) VALUES
  ('pending', 'Pending', 10, 'Job queued'),
  ('in_progress', 'In Progress', 20, 'Normalization in progress'),
  ('draft_ready', 'Draft Ready', 30, 'Draft output(s) ready for human review'),
  ('completed', 'Completed', 40, 'Job finished (approved or rejected)'),
  ('failed', 'Failed', 50, 'Job failed'),
  ('cancelled', 'Cancelled', 60, 'Cancelled'),
  ('pending_review', 'Pending Review', 70, 'Output awaiting reviewer'),
  ('approved', 'Approved', 80, 'Output approved and published'),
  ('rejected', 'Rejected', 90, 'Output rejected by reviewer');

INSERT INTO public.normalization_templates (code, label, description, knowledge_type_id, schema_definition, default_structured_data, sort_order)
SELECT
  t.code,
  t.label,
  t.description,
  kt.id,
  t.schema_def,
  t.default_data,
  t.sort_order
FROM (VALUES
  (
    'concept_card',
    'Concept Card',
    'General concept or technique knowledge from documentation',
    'technique',
    '{"required":["concept"]}'::jsonb,
    '{"concept":"","key_points":[],"see_also":[]}'::jsonb,
    10
  ),
  (
    'model_card',
    'Model Card',
    'Checkpoint or diffusion model facts',
    'model',
    '{"required":["model_family"]}'::jsonb,
    '{"model_family":"","parameters":"","license":"","recommended_use":""}'::jsonb,
    20
  ),
  (
    'node_card',
    'Node Card',
    'ComfyUI node capabilities and parameters',
    'node',
    '{"required":["node_class"]}'::jsonb,
    '{"node_class":"","category":"","inputs":[],"outputs":[]}'::jsonb,
    30
  ),
  (
    'workflow_pattern_card',
    'Workflow Pattern Card',
    'Reusable workflow composition pattern',
    'workflow',
    '{"required":["pattern"]}'::jsonb,
    '{"pattern":"","nodes_involved":[],"when_to_use":""}'::jsonb,
    40
  ),
  (
    'failure_candidate_card',
    'Failure Candidate Card',
    'Potential failure symptom for failure intelligence review',
    'failure',
    '{"required":["symptom"]}'::jsonb,
    '{"symptom":"","likely_causes":[],"detection_hints":[]}'::jsonb,
    50
  ),
  (
    'recipe_candidate_card',
    'Recipe Candidate Card',
    'Studio recipe candidate for recipe module review',
    'technique',
    '{"required":["recipe_hint"]}'::jsonb,
    '{"recipe_hint":"","steps_outline":[],"constraints_hint":""}'::jsonb,
    60
  )
) AS t(code, label, description, kt_code, schema_def, default_data, sort_order)
JOIN public.knowledge_types kt ON kt.code = t.kt_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.normalization_templates nt WHERE nt.code = t.code
);

DO $$
DECLARE
  active_id UUID;
BEGIN
  SELECT public.active_status_id() INTO active_id;
  UPDATE public.normalization_statuses SET status = active_id WHERE status IS NULL;
  UPDATE public.normalization_templates SET status = active_id WHERE status IS NULL;
END $$;
