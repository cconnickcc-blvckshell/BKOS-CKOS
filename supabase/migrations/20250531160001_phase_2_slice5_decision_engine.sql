-- CKOS Phase 2 Slice 5: Decision engine foundation (additive only)

-- ---------------------------------------------------------------------------
-- Lookup tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.decision_statuses (
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

CREATE TABLE public.decision_goal_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  workflow_purpose_code TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE TABLE public.decision_constraint_types (
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
-- Decision requests
-- ---------------------------------------------------------------------------

CREATE TABLE public.decision_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id UUID NOT NULL REFERENCES public.decision_statuses(id),
  goal_type_id UUID NOT NULL REFERENCES public.decision_goal_types(id),
  goal_text TEXT NOT NULL,
  desired_output TEXT,
  domain_id UUID REFERENCES public.knowledge_domains(id) ON DELETE SET NULL,
  hardware_tier_id UUID REFERENCES public.hardware_tiers(id) ON DELETE SET NULL,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX decision_requests_status_idx ON public.decision_requests (status_id, created_at DESC);
CREATE INDEX decision_requests_user_idx ON public.decision_requests (requested_by, created_at DESC);

-- ---------------------------------------------------------------------------
-- Request constraints
-- ---------------------------------------------------------------------------

CREATE TABLE public.decision_request_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_request_id UUID NOT NULL REFERENCES public.decision_requests(id) ON DELETE CASCADE,
  constraint_type_id UUID NOT NULL REFERENCES public.decision_constraint_types(id),
  value_text TEXT,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (decision_request_id, constraint_type_id)
);

CREATE INDEX decision_request_constraints_request_idx
  ON public.decision_request_constraints (decision_request_id);

-- ---------------------------------------------------------------------------
-- Recommendations (reviewable; never auto-executes)
-- ---------------------------------------------------------------------------

CREATE TABLE public.decision_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_request_id UUID NOT NULL REFERENCES public.decision_requests(id) ON DELETE CASCADE,
  status_id UUID NOT NULL REFERENCES public.decision_statuses(id),
  confidence_score NUMERIC(4, 3) NOT NULL DEFAULT 0.5,
  recommended_approach TEXT NOT NULL,
  suggested_model_family TEXT,
  missing_information JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  retrieval_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX decision_recommendations_request_idx
  ON public.decision_recommendations (decision_request_id);

-- ---------------------------------------------------------------------------
-- Recommendation items (each must link to CKOS evidence)
-- ---------------------------------------------------------------------------

CREATE TABLE public.decision_recommendation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_recommendation_id UUID NOT NULL REFERENCES public.decision_recommendations(id) ON DELETE CASCADE,
  item_role TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  rationale TEXT NOT NULL,
  confidence_score NUMERIC(4, 3),
  sort_order INT NOT NULL DEFAULT 0,
  knowledge_record_id UUID REFERENCES public.knowledge_records(id) ON DELETE SET NULL,
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE SET NULL,
  workflow_analysis_id UUID REFERENCES public.workflow_analysis(id) ON DELETE SET NULL,
  failure_record_id UUID REFERENCES public.failure_records(id) ON DELETE SET NULL,
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  CONSTRAINT decision_item_has_evidence CHECK (
    knowledge_record_id IS NOT NULL
    OR workflow_id IS NOT NULL
    OR workflow_analysis_id IS NOT NULL
    OR failure_record_id IS NOT NULL
    OR recipe_id IS NOT NULL
  )
);

CREATE INDEX decision_recommendation_items_rec_idx
  ON public.decision_recommendation_items (decision_recommendation_id, sort_order);

-- ---------------------------------------------------------------------------
-- Source links / citations
-- ---------------------------------------------------------------------------

CREATE TABLE public.decision_source_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_recommendation_id UUID NOT NULL REFERENCES public.decision_recommendations(id) ON DELETE CASCADE,
  decision_recommendation_item_id UUID REFERENCES public.decision_recommendation_items(id) ON DELETE CASCADE,
  linked_entity_type TEXT NOT NULL,
  linked_entity_id UUID NOT NULL,
  citation_text TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX decision_source_links_rec_idx
  ON public.decision_source_links (decision_recommendation_id, sort_order);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_decision_statuses_updated_at
  BEFORE UPDATE ON public.decision_statuses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_decision_goal_types_updated_at
  BEFORE UPDATE ON public.decision_goal_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_decision_constraint_types_updated_at
  BEFORE UPDATE ON public.decision_constraint_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_decision_requests_updated_at
  BEFORE UPDATE ON public.decision_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_decision_request_constraints_updated_at
  BEFORE UPDATE ON public.decision_request_constraints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_decision_recommendations_updated_at
  BEFORE UPDATE ON public.decision_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_decision_recommendation_items_updated_at
  BEFORE UPDATE ON public.decision_recommendation_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_decision_source_links_updated_at
  BEFORE UPDATE ON public.decision_source_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.decision_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_goal_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_constraint_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_request_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_recommendation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_source_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decision_statuses_read" ON public.decision_statuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "decision_goal_types_read" ON public.decision_goal_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "decision_constraint_types_read" ON public.decision_constraint_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "decision_requests_all" ON public.decision_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (requested_by = auth.uid() OR created_by = auth.uid());

CREATE POLICY "decision_request_constraints_all" ON public.decision_request_constraints
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "decision_recommendations_all" ON public.decision_recommendations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "decision_recommendation_items_all" ON public.decision_recommendation_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "decision_source_links_all" ON public.decision_source_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------

INSERT INTO public.decision_statuses (code, label, sort_order, description) VALUES
  ('pending', 'Pending', 10, 'Request created; recommendation not built'),
  ('in_progress', 'In Progress', 20, 'Building recommendation'),
  ('recommendation_ready', 'Recommendation Ready', 30, 'Reviewable recommendation available'),
  ('insufficient_evidence', 'Insufficient Evidence', 40, 'Not enough linked CKOS records to recommend'),
  ('failed', 'Failed', 50, 'Recommendation build failed'),
  ('archived', 'Archived', 60, 'Archived request')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.decision_goal_types (code, label, description, workflow_purpose_code, sort_order) VALUES
  ('create_poster', 'Create Poster', 'Poster or layout composition', 'poster', 10),
  ('maintain_character_consistency', 'Maintain Character Consistency', 'Consistent character across outputs', 'character_consistency', 20),
  ('edit_existing_image', 'Edit Existing Image', 'Inpaint, kontext, regional edit', 'image_editing', 30),
  ('upscale_image', 'Upscale Image', 'Upscaling and enhancement', 'upscale', 40),
  ('generate_video', 'Generate Video', 'Video generation pipeline', 'video', 50),
  ('talking_character_video', 'Talking Character Video', 'Lip-sync / talking head', 'talking_character', 60),
  ('troubleshoot_workflow', 'Troubleshoot Workflow', 'Diagnose workflow failures', NULL, 70),
  ('choose_model', 'Choose Model', 'Model/checkpoint selection', NULL, 80),
  ('optimize_for_hardware', 'Optimize for Hardware', 'Fit pipeline to GPU constraints', NULL, 90),
  ('unknown', 'Unknown', 'Goal type not classified', NULL, 999)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.decision_constraint_types (code, label, description, sort_order) VALUES
  ('hardware', 'Hardware', 'GPU / VRAM tier', 10),
  ('model_family', 'Model Family', 'Preferred model family', 20),
  ('output_platform', 'Output Platform', 'Target platform e.g. Facebook', 30),
  ('safety_level', 'Safety Level', 'Content safety constraints', 40),
  ('quality_target', 'Quality Target', 'Quality vs speed preference', 50),
  ('speed_target', 'Speed Target', 'Throughput preference', 60),
  ('source_image_available', 'Source Image Available', 'User has a source image', 70),
  ('reference_character_available', 'Reference Character Available', 'User has character reference', 80),
  ('workflow_json_available', 'Workflow JSON Available', 'User has workflow JSON', 90)
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE active_id UUID;
BEGIN
  SELECT public.active_status_id() INTO active_id;
  UPDATE public.decision_statuses SET status = active_id WHERE status IS NULL;
  UPDATE public.decision_goal_types SET status = active_id WHERE status IS NULL;
  UPDATE public.decision_constraint_types SET status = active_id WHERE status IS NULL;
END $$;
