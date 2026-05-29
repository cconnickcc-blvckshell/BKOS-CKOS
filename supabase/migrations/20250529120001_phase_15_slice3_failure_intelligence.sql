-- CKOS Phase 1.5 Slice 3: Failure Intelligence Foundation (additive only)

-- ---------------------------------------------------------------------------
-- Lookup tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.severity_levels (
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

CREATE TABLE public.failure_categories (
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
-- Extend failure_records (keep legacy JSONB columns)
-- ---------------------------------------------------------------------------

ALTER TABLE public.failure_records
  ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES public.entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS severity_level_id UUID REFERENCES public.severity_levels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.failure_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS probability_score NUMERIC(4, 3)
    CHECK (probability_score IS NULL OR (probability_score >= 0 AND probability_score <= 1)),
  ADD COLUMN IF NOT EXISTS detection_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analysis_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- domain_id added in slice 1; enforce domain awareness for new rows via app + NOT NULL later
COMMENT ON COLUMN public.failure_records.domain_id IS 'Required for new failures (enforced in application layer during Phase 1.5)';

CREATE INDEX IF NOT EXISTS failure_records_domain_idx ON public.failure_records (domain_id);
CREATE INDEX IF NOT EXISTS failure_records_entity_idx ON public.failure_records (entity_id);
CREATE INDEX IF NOT EXISTS failure_records_severity_idx ON public.failure_records (severity_level_id);
CREATE INDEX IF NOT EXISTS failure_records_category_idx ON public.failure_records (category_id);

-- ---------------------------------------------------------------------------
-- Normalized causes & fixes
-- ---------------------------------------------------------------------------

CREATE TABLE public.failure_causes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_id UUID NOT NULL REFERENCES public.failure_records(id) ON DELETE CASCADE,
  cause TEXT NOT NULL,
  confidence_score NUMERIC(4, 3)
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  evidence TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX failure_causes_failure_idx ON public.failure_causes (failure_id, sort_order);

CREATE TABLE public.failure_fixes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_id UUID NOT NULL REFERENCES public.failure_records(id) ON DELETE CASCADE,
  recommended_fix TEXT NOT NULL,
  effectiveness_score NUMERIC(4, 3)
    CHECK (effectiveness_score IS NULL OR (effectiveness_score >= 0 AND effectiveness_score <= 1)),
  risk_level TEXT,
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX failure_fixes_failure_idx ON public.failure_fixes (failure_id, sort_order);

-- ---------------------------------------------------------------------------
-- Cross-entity links
-- ---------------------------------------------------------------------------

CREATE TABLE public.workflow_failure_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  failure_id UUID NOT NULL REFERENCES public.failure_records(id) ON DELETE CASCADE,
  likelihood_score NUMERIC(4, 3)
    CHECK (likelihood_score IS NULL OR (likelihood_score >= 0 AND likelihood_score <= 1)),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (workflow_id, failure_id)
);

CREATE INDEX workflow_failure_links_workflow_idx ON public.workflow_failure_links (workflow_id);
CREATE INDEX workflow_failure_links_failure_idx ON public.workflow_failure_links (failure_id);

CREATE TABLE public.knowledge_failure_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_record_id UUID NOT NULL REFERENCES public.knowledge_records(id) ON DELETE CASCADE,
  failure_id UUID NOT NULL REFERENCES public.failure_records(id) ON DELETE CASCADE,
  relationship_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (knowledge_record_id, failure_id)
);

CREATE INDEX knowledge_failure_links_knowledge_idx ON public.knowledge_failure_links (knowledge_record_id);
CREATE INDEX knowledge_failure_links_failure_idx ON public.knowledge_failure_links (failure_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_severity_levels_updated_at
  BEFORE UPDATE ON public.severity_levels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_failure_categories_updated_at
  BEFORE UPDATE ON public.failure_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_failure_causes_updated_at
  BEFORE UPDATE ON public.failure_causes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_failure_fixes_updated_at
  BEFORE UPDATE ON public.failure_fixes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_workflow_failure_links_updated_at
  BEFORE UPDATE ON public.workflow_failure_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_knowledge_failure_links_updated_at
  BEFORE UPDATE ON public.knowledge_failure_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.severity_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failure_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failure_causes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failure_fixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_failure_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_failure_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "severity_levels_read" ON public.severity_levels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "failure_categories_read" ON public.failure_categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "failure_causes_all" ON public.failure_causes
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "failure_fixes_all" ON public.failure_fixes
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "workflow_failure_links_all" ON public.workflow_failure_links
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "knowledge_failure_links_all" ON public.knowledge_failure_links
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

-- ---------------------------------------------------------------------------
-- Seeds: severity & categories
-- ---------------------------------------------------------------------------

INSERT INTO public.severity_levels (code, label, sort_order) VALUES
  ('low', 'Low', 10),
  ('medium', 'Medium', 20),
  ('high', 'High', 30),
  ('critical', 'Critical', 40);

INSERT INTO public.failure_categories (code, label, sort_order) VALUES
  ('anatomy', 'Anatomy', 10),
  ('identity_consistency', 'Identity Consistency', 20),
  ('controlnet', 'ControlNet', 30),
  ('lora', 'LoRA', 40),
  ('model_loading', 'Model Loading', 50),
  ('missing_nodes', 'Missing Nodes', 60),
  ('vram', 'VRAM', 70),
  ('sampling', 'Sampling', 80),
  ('prompting', 'Prompting', 90),
  ('upscaling', 'Upscaling', 100),
  ('video_motion', 'Video Motion', 110),
  ('video_identity', 'Video Identity', 120),
  ('workflow_validation', 'Workflow Validation', 130),
  ('output_quality', 'Output Quality', 140),
  ('unknown', 'Unknown', 999);

-- ---------------------------------------------------------------------------
-- Seed example failures (comfyui domain)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  active_id UUID;
  comfy_id UUID;
  sev_high UUID;
  sev_med UUID;
  sev_crit UUID;
  cat_anatomy UUID;
  cat_identity UUID;
  cat_controlnet UUID;
  cat_vram UUID;
  cat_missing UUID;
  cat_output UUID;
  cat_video_motion UUID;
  cat_video_identity UUID;
  f_face UUID;
  f_fingers UUID;
  f_cn UUID;
  f_vram UUID;
  f_node UUID;
  f_poster UUID;
  f_flicker UUID;
  f_vid_id UUID;
BEGIN
  SELECT public.active_status_id() INTO active_id;
  SELECT id INTO comfy_id FROM public.knowledge_domains WHERE code = 'comfyui';

  UPDATE public.severity_levels SET status = active_id WHERE status IS NULL;
  UPDATE public.failure_categories SET status = active_id WHERE status IS NULL;

  SELECT id INTO sev_high FROM public.severity_levels WHERE code = 'high';
  SELECT id INTO sev_med FROM public.severity_levels WHERE code = 'medium';
  SELECT id INTO sev_crit FROM public.severity_levels WHERE code = 'critical';

  SELECT id INTO cat_anatomy FROM public.failure_categories WHERE code = 'anatomy';
  SELECT id INTO cat_identity FROM public.failure_categories WHERE code = 'identity_consistency';
  SELECT id INTO cat_controlnet FROM public.failure_categories WHERE code = 'controlnet';
  SELECT id INTO cat_vram FROM public.failure_categories WHERE code = 'vram';
  SELECT id INTO cat_missing FROM public.failure_categories WHERE code = 'missing_nodes';
  SELECT id INTO cat_output FROM public.failure_categories WHERE code = 'output_quality';
  SELECT id INTO cat_video_motion FROM public.failure_categories WHERE code = 'video_motion';
  SELECT id INTO cat_video_identity FROM public.failure_categories WHERE code = 'video_identity';

  INSERT INTO public.failure_records (
    domain_id, symptom, description, severity_level_id, category_id,
    probability_score, detection_signals, status, created_by
  )
  SELECT comfy_id, v.symptom, v.description, v.sev, v.cat, v.prob, v.signals::jsonb, active_id, NULL
  FROM (VALUES
    ('Face Drift', 'Subject face changes identity across generations or batches.', sev_high, cat_identity, 0.75, '{"signals":["face_inconsistent","identity_shift"]}'),
    ('Extra Fingers', 'Anatomically incorrect hand/finger count in output.', sev_med, cat_anatomy, 0.65, '{"signals":["hand_artifact","extra_digits"]}'),
    ('ControlNet Ignored', 'Control guidance has little or no effect on final image.', sev_high, cat_controlnet, 0.7, '{"signals":["pose_mismatch","cn_weight_low"]}'),
    ('VRAM Exhaustion', 'GPU runs out of memory during sampling or model load.', sev_crit, cat_vram, 0.9, '{"signals":["cuda_oom","allocation_error"]}'),
    ('Missing Custom Node', 'Workflow fails validation because a node class is not installed.', sev_high, cat_missing, 0.95, '{"signals":["node_not_found","import_error"]}'),
    ('Poster Text Garbage', 'Rendered typography is illegible or nonsensical for poster layouts.', sev_med, cat_output, 0.6, '{"signals":["text_artifacts","glyph_breakage"]}'),
    ('Video Flicker', 'Temporal instability between frames in video output.', sev_med, cat_video_motion, 0.7, '{"signals":["frame_flicker","temporal_noise"]}'),
    ('Identity Drift In Video', 'Character identity shifts over video sequence.', sev_high, cat_video_identity, 0.8, '{"signals":["face_drift_video","character_inconsistent"]}')
  ) AS v(symptom, description, sev, cat, prob, signals)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.failure_records fr
    WHERE fr.symptom = v.symptom AND fr.domain_id = comfy_id
  );

  SELECT id INTO f_face FROM public.failure_records WHERE symptom = 'Face Drift' AND domain_id = comfy_id LIMIT 1;
  SELECT id INTO f_fingers FROM public.failure_records WHERE symptom = 'Extra Fingers' AND domain_id = comfy_id LIMIT 1;
  SELECT id INTO f_cn FROM public.failure_records WHERE symptom = 'ControlNet Ignored' AND domain_id = comfy_id LIMIT 1;
  SELECT id INTO f_vram FROM public.failure_records WHERE symptom = 'VRAM Exhaustion' AND domain_id = comfy_id LIMIT 1;
  SELECT id INTO f_node FROM public.failure_records WHERE symptom = 'Missing Custom Node' AND domain_id = comfy_id LIMIT 1;
  SELECT id INTO f_poster FROM public.failure_records WHERE symptom = 'Poster Text Garbage' AND domain_id = comfy_id LIMIT 1;
  SELECT id INTO f_flicker FROM public.failure_records WHERE symptom = 'Video Flicker' AND domain_id = comfy_id LIMIT 1;
  SELECT id INTO f_vid_id FROM public.failure_records WHERE symptom = 'Identity Drift In Video' AND domain_id = comfy_id LIMIT 1;

  -- Face Drift causes & fixes
  IF f_face IS NOT NULL THEN
    INSERT INTO public.failure_causes (failure_id, cause, confidence_score, evidence, sort_order, status)
    SELECT f_face, c.cause, c.conf, c.ev, c.ord, active_id FROM (VALUES
      ('Low IPAdapter weight or weak reference image', 0.85::numeric, 'Common in Flux + IPAdapter stacks', 1),
      ('Conflicting prompt describing different identity', 0.7::numeric, NULL::text, 2),
      ('High denoise on img2img breaking identity', 0.65::numeric, NULL::text, 3)
    ) AS c(cause, conf, ev, ord)
    WHERE NOT EXISTS (SELECT 1 FROM public.failure_causes fc WHERE fc.failure_id = f_face AND fc.cause = c.cause);
    INSERT INTO public.failure_fixes (failure_id, recommended_fix, effectiveness_score, risk_level, notes, sort_order, status)
    SELECT f_face, f.fix, f.eff, f.risk, f.notes, f.ord, active_id FROM (VALUES
      ('Increase IPAdapter weight (0.6–0.85) and use a clear frontal reference', 0.8::numeric, 'low', NULL::text, 1),
      ('Lock seed and reduce denoise for identity-preserving passes', 0.75::numeric, 'low', NULL::text, 2),
      ('Add InstantID / PuLID node if available', 0.7::numeric, 'medium', 'Requires compatible checkpoint', 3)
    ) AS f(fix, eff, risk, notes, ord)
    WHERE NOT EXISTS (SELECT 1 FROM public.failure_fixes ff WHERE ff.failure_id = f_face AND ff.recommended_fix = f.fix);
  END IF;

  -- Extra Fingers
  IF f_fingers IS NOT NULL THEN
    INSERT INTO public.failure_causes (failure_id, cause, confidence_score, sort_order, status)
    SELECT f_fingers, c.cause, c.conf, c.ord, active_id FROM (VALUES
      ('Model anatomy weakness at default CFG', 0.8::numeric, 1),
      ('Low step count before convergence', 0.55::numeric, 2)
    ) AS c(cause, conf, ord)
    WHERE NOT EXISTS (SELECT 1 FROM public.failure_causes fc WHERE fc.failure_id = f_fingers AND fc.cause = c.cause);
    INSERT INTO public.failure_fixes (failure_id, recommended_fix, effectiveness_score, risk_level, sort_order, status)
    SELECT f_fingers, f.fix, f.eff, f.risk, f.ord, active_id FROM (VALUES
      ('Add negative prompt for extra fingers / bad hands', 0.7::numeric, 'low', 1),
      ('Use hand-refiner secondary pass or ControlNet hand depth', 0.75::numeric, 'medium', 2)
    ) AS f(fix, eff, risk, ord)
    WHERE NOT EXISTS (SELECT 1 FROM public.failure_fixes ff WHERE ff.failure_id = f_fingers AND ff.recommended_fix = f.fix);
  END IF;

  -- ControlNet Ignored
  IF f_cn IS NOT NULL THEN
    INSERT INTO public.failure_causes (failure_id, cause, confidence_score, sort_order, status)
    SELECT f_cn, c.cause, c.conf, c.ord, active_id FROM (VALUES
      ('ControlNet strength set too low', 0.9::numeric, 1),
      ('Preprocessor output not connected to Apply node', 0.85::numeric, 2),
      ('Wrong ControlNet model for checkpoint family', 0.75::numeric, 3)
    ) AS c(cause, conf, ord)
    WHERE NOT EXISTS (SELECT 1 FROM public.failure_causes fc WHERE fc.failure_id = f_cn AND fc.cause = c.cause);
    INSERT INTO public.failure_fixes (failure_id, recommended_fix, effectiveness_score, risk_level, sort_order, status)
    SELECT f_cn, f.fix, f.eff, f.risk, f.ord, active_id FROM (VALUES
      ('Set ControlNet strength 0.65–1.0 and verify preprocessor preview', 0.85::numeric, 'low', 1),
      ('Match ControlNet type to model (Flux vs SDXL)', 0.8::numeric, 'medium', 2)
    ) AS f(fix, eff, risk, ord)
    WHERE NOT EXISTS (SELECT 1 FROM public.failure_fixes ff WHERE ff.failure_id = f_cn AND ff.recommended_fix = f.fix);
  END IF;

  -- VRAM
  IF f_vram IS NOT NULL THEN
    INSERT INTO public.failure_causes (failure_id, cause, confidence_score, sort_order, status)
    SELECT f_vram, c.cause, c.conf, c.ord, active_id FROM (VALUES
      ('Batch size or resolution too high for GPU', 0.9::numeric, 1),
      ('Multiple large models loaded simultaneously', 0.85::numeric, 2)
    ) AS c(cause, conf, ord)
    WHERE NOT EXISTS (SELECT 1 FROM public.failure_causes fc WHERE fc.failure_id = f_vram AND fc.cause = c.cause);
    INSERT INTO public.failure_fixes (failure_id, recommended_fix, effectiveness_score, risk_level, sort_order, status)
    SELECT f_vram, f.fix, f.eff, f.risk, f.ord, active_id FROM (VALUES
      ('Reduce resolution or enable model offloading / --lowvram', 0.85::numeric, 'low', 1),
      ('Use fp8 / quantized checkpoint variant', 0.8::numeric, 'medium', 2)
    ) AS f(fix, eff, risk, ord)
    WHERE NOT EXISTS (SELECT 1 FROM public.failure_fixes ff WHERE ff.failure_id = f_vram AND ff.recommended_fix = f.fix);
  END IF;

  -- Missing node
  IF f_node IS NOT NULL THEN
    INSERT INTO public.failure_fixes (failure_id, recommended_fix, effectiveness_score, risk_level, sort_order, status)
    SELECT f_node, f.fix, f.eff, f.risk, f.ord, active_id FROM (VALUES
      ('Install missing custom node pack via ComfyUI Manager', 0.95::numeric, 'low', 1),
      ('Replace node with core equivalent if available', 0.6::numeric, 'medium', 2)
    ) AS f(fix, eff, risk, ord)
    WHERE NOT EXISTS (SELECT 1 FROM public.failure_fixes ff WHERE ff.failure_id = f_node AND ff.recommended_fix = f.fix);
  END IF;

  -- Video failures (abbreviated)
  IF f_flicker IS NOT NULL THEN
    INSERT INTO public.failure_fixes (failure_id, recommended_fix, effectiveness_score, risk_level, sort_order, status)
    SELECT f_flicker, f.fix, f.eff, f.risk, f.ord, active_id FROM (VALUES
      ('Increase temporal consistency steps; reduce motion strength', 0.7::numeric, 'low', 1)
    ) AS f(fix, eff, risk, ord)
    WHERE NOT EXISTS (SELECT 1 FROM public.failure_fixes ff WHERE ff.failure_id = f_flicker AND ff.recommended_fix = f.fix);
  END IF;

  IF f_vid_id IS NOT NULL THEN
    INSERT INTO public.failure_fixes (failure_id, recommended_fix, effectiveness_score, risk_level, sort_order, status)
    SELECT f_vid_id, f.fix, f.eff, f.risk, f.ord, active_id FROM (VALUES
      ('Use reference frame lock + lower motion bucket in Wan/AnimateDiff', 0.75::numeric, 'medium', 1)
    ) AS f(fix, eff, risk, ord)
    WHERE NOT EXISTS (SELECT 1 FROM public.failure_fixes ff WHERE ff.failure_id = f_vid_id AND ff.recommended_fix = f.fix);
  END IF;
END $$;
