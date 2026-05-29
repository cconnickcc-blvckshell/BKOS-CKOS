-- CKOS Phase 1.5 Slice 4: Recipe Inheritance Foundation (additive only)

-- ---------------------------------------------------------------------------
-- Lookup tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.recipe_categories (
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

CREATE TABLE public.recipe_variant_types (
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

CREATE TABLE public.recipe_dependency_types (
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
-- Extend recipes (keep legacy columns)
-- ---------------------------------------------------------------------------

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES public.entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.recipe_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_type_id UUID REFERENCES public.recipe_variant_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipe_slug TEXT,
  ADD COLUMN IF NOT EXISTS objective TEXT,
  ADD COLUMN IF NOT EXISTS inputs_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS default_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quality_checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS safety_notes TEXT;

CREATE UNIQUE INDEX recipes_domain_slug_idx
  ON public.recipes (domain_id, recipe_slug)
  WHERE recipe_slug IS NOT NULL;

CREATE INDEX recipes_parent_idx ON public.recipes (parent_recipe_id);
CREATE INDEX recipes_category_idx ON public.recipes (category_id);

-- ---------------------------------------------------------------------------
-- Recipe versions
-- ---------------------------------------------------------------------------

CREATE TABLE public.recipe_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  title TEXT NOT NULL,
  objective TEXT,
  steps_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  parameters_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality_checks_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (recipe_id, version_number)
);

-- ---------------------------------------------------------------------------
-- Recipe steps (normalized; replaces reliance on steps JSONB for new data)
-- ---------------------------------------------------------------------------

CREATE TABLE public.recipe_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  step_number INT NOT NULL,
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT true,
  estimated_cost_level TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (recipe_id, step_number)
);

CREATE INDEX recipe_steps_recipe_idx ON public.recipe_steps (recipe_id, step_number);

-- ---------------------------------------------------------------------------
-- Dependencies & links
-- ---------------------------------------------------------------------------

CREATE TABLE public.recipe_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  depends_on_recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  dependency_type_id UUID NOT NULL REFERENCES public.recipe_dependency_types(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  CHECK (recipe_id <> depends_on_recipe_id),
  UNIQUE (recipe_id, depends_on_recipe_id, dependency_type_id)
);

CREATE TABLE public.recipe_knowledge_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  knowledge_record_id UUID NOT NULL REFERENCES public.knowledge_records(id) ON DELETE CASCADE,
  relationship_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (recipe_id, knowledge_record_id)
);

CREATE TABLE public.recipe_workflow_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (recipe_id, workflow_id)
);

CREATE TABLE public.recipe_failure_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  failure_id UUID NOT NULL REFERENCES public.failure_records(id) ON DELETE CASCADE,
  mitigation_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (recipe_id, failure_id)
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_recipe_categories_updated_at
  BEFORE UPDATE ON public.recipe_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_recipe_variant_types_updated_at
  BEFORE UPDATE ON public.recipe_variant_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_recipe_dependency_types_updated_at
  BEFORE UPDATE ON public.recipe_dependency_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_recipe_versions_updated_at
  BEFORE UPDATE ON public.recipe_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_recipe_steps_updated_at
  BEFORE UPDATE ON public.recipe_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_recipe_dependencies_updated_at
  BEFORE UPDATE ON public.recipe_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_recipe_knowledge_links_updated_at
  BEFORE UPDATE ON public.recipe_knowledge_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_recipe_workflow_links_updated_at
  BEFORE UPDATE ON public.recipe_workflow_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_recipe_failure_links_updated_at
  BEFORE UPDATE ON public.recipe_failure_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.recipe_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_variant_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_dependency_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_knowledge_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_workflow_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_failure_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipe_categories_read" ON public.recipe_categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "recipe_variant_types_read" ON public.recipe_variant_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "recipe_dependency_types_read" ON public.recipe_dependency_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "recipe_versions_all" ON public.recipe_versions
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "recipe_steps_all" ON public.recipe_steps
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "recipe_dependencies_all" ON public.recipe_dependencies
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "recipe_knowledge_links_all" ON public.recipe_knowledge_links
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "recipe_workflow_links_all" ON public.recipe_workflow_links
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "recipe_failure_links_all" ON public.recipe_failure_links
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------

INSERT INTO public.recipe_categories (code, label, sort_order) VALUES
  ('poster', 'Poster', 10),
  ('character_consistency', 'Character Consistency', 20),
  ('video', 'Video', 30),
  ('talking_character', 'Talking Character', 40),
  ('upscaling', 'Upscaling', 50),
  ('image_editing', 'Image Editing', 60),
  ('product_mockup', 'Product Mockup', 70),
  ('social_media', 'Social Media', 80),
  ('workflow_debugging', 'Workflow Debugging', 90),
  ('research', 'Research', 100),
  ('unknown', 'Unknown', 999);

INSERT INTO public.recipe_variant_types (code, label, sort_order) VALUES
  ('base', 'Base', 10),
  ('facebook_safe', 'Facebook Safe', 20),
  ('telegram', 'Telegram', 30),
  ('event', 'Event', 40),
  ('merch', 'Merch', 50),
  ('cinematic', 'Cinematic', 60),
  ('fast_draft', 'Fast Draft', 70),
  ('high_quality', 'High Quality', 80),
  ('experimental', 'Experimental', 90);

INSERT INTO public.recipe_dependency_types (code, label, sort_order) VALUES
  ('extends', 'Extends', 10),
  ('requires', 'Requires', 20),
  ('overrides', 'Overrides', 30),
  ('recommends', 'Recommends', 40);

DO $$
DECLARE
  active_id UUID;
  comfy_id UUID;
  cat_poster UUID;
  cat_char UUID;
  cat_video UUID;
  cat_talk UUID;
  var_base UUID;
  var_fb UUID;
  var_cine UUID;
  base_id UUID;
  fb_id UUID;
BEGIN
  SELECT public.active_status_id() INTO active_id;
  SELECT id INTO comfy_id FROM public.knowledge_domains WHERE code = 'comfyui';

  UPDATE public.recipe_categories SET status = active_id WHERE status IS NULL;
  UPDATE public.recipe_variant_types SET status = active_id WHERE status IS NULL;
  UPDATE public.recipe_dependency_types SET status = active_id WHERE status IS NULL;

  SELECT id INTO cat_poster FROM public.recipe_categories WHERE code = 'poster';
  SELECT id INTO cat_char FROM public.recipe_categories WHERE code = 'character_consistency';
  SELECT id INTO cat_video FROM public.recipe_categories WHERE code = 'video';
  SELECT id INTO cat_talk FROM public.recipe_categories WHERE code = 'talking_character';
  SELECT id INTO var_base FROM public.recipe_variant_types WHERE code = 'base';
  SELECT id INTO var_fb FROM public.recipe_variant_types WHERE code = 'facebook_safe';
  SELECT id INTO var_cine FROM public.recipe_variant_types WHERE code = 'cinematic';

  -- Base Poster Recipe
  INSERT INTO public.recipes (
    domain_id, title, recipe_slug, objective, description, category_id, variant_type_id,
    constraints, default_parameters, quality_checks, safety_notes, status
  )
  SELECT comfy_id, 'Base Poster Recipe', 'base_poster',
    'Produce a print-ready marketing poster from a structured ComfyUI workflow.',
    'Parent recipe for poster variants — defines layout, export, and QA defaults.',
    cat_poster, var_base,
    '{"min_resolution":"2048x2048","color_profile":"sRGB","safe_margins_pct":5}'::jsonb,
    '{"cfg":7,"steps":28,"sampler":"dpmpp_2m"}'::jsonb,
    '{"checks":["no_text_garbage","sharp_edges","brand_colors"]}'::jsonb,
    'Verify licensed assets and model terms before client delivery.',
    active_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.recipes WHERE recipe_slug = 'base_poster' AND domain_id = comfy_id
  );

  SELECT id INTO base_id FROM public.recipes WHERE recipe_slug = 'base_poster' AND domain_id = comfy_id;

  IF base_id IS NOT NULL THEN
    INSERT INTO public.recipe_steps (recipe_id, step_number, title, instruction, required, estimated_cost_level, status)
    SELECT base_id, s.num, s.title, s.inst, true, s.cost, active_id FROM (VALUES
      (1, 'Prepare canvas', 'Set poster dimensions and bleed margins in latent or image template.', 'low'),
      (2, 'Generate key visual', 'Run main txt2img / img2img pass with approved checkpoint and LoRAs.', 'medium'),
      (3, 'Typography pass', 'Add headline and CTA in compositor or secondary inpaint region.', 'medium'),
      (4, 'Export', 'Export PNG + PDF at target DPI; archive workflow JSON.', 'low')
    ) AS s(num, title, inst, cost)
    WHERE NOT EXISTS (SELECT 1 FROM public.recipe_steps WHERE recipe_id = base_id AND step_number = 1);
  END IF;

  -- Facebook-Safe Poster Variant (child)
  INSERT INTO public.recipes (
    domain_id, parent_recipe_id, title, recipe_slug, objective, category_id, variant_type_id,
    constraints, default_parameters, quality_checks, safety_notes, status
  )
  SELECT comfy_id, base_id, 'Facebook-Safe Poster Variant', 'facebook_safe_poster',
    NULL,
    cat_poster, var_fb,
    '{"min_resolution":"1080x1080","max_file_mb":8,"safe_margins_pct":10,"platform":"facebook"}'::jsonb,
  '{"cfg":6.5,"steps":26}'::jsonb,
    '{"checks":["no_text_garbage","safe_zone_compliance","file_size_under_limit"]}'::jsonb,
    'Avoid excessive text overlay; follow Meta ad safe-zone guidelines.',
    active_id
  WHERE base_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.recipes WHERE recipe_slug = 'facebook_safe_poster' AND domain_id = comfy_id
    );

  SELECT id INTO fb_id FROM public.recipes WHERE recipe_slug = 'facebook_safe_poster' AND domain_id = comfy_id;

  IF fb_id IS NOT NULL THEN
    INSERT INTO public.recipe_steps (recipe_id, step_number, title, instruction, required, status)
    SELECT fb_id, 3, 'Compress for Meta', 'Re-export JPEG/WebP under 8MB with safe-zone validation.', true, active_id
    WHERE NOT EXISTS (SELECT 1 FROM public.recipe_steps WHERE recipe_id = fb_id AND step_number = 3);
  END IF;

  -- Character Consistency Recipe
  INSERT INTO public.recipes (
    domain_id, title, recipe_slug, objective, category_id, variant_type_id,
    constraints, default_parameters, quality_checks, status
  )
  SELECT comfy_id, 'Character Consistency Recipe', 'character_consistency',
    'Maintain character identity across a batch of generations using reference adapters.',
    cat_char, var_base,
    '{"reference_images_min":1,"identity_strength_min":0.6}'::jsonb,
    '{"ipadapter_weight":0.75}'::jsonb,
    '{"checks":["face_match","outfit_consistency"]}'::jsonb,
    active_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.recipes WHERE recipe_slug = 'character_consistency' AND domain_id = comfy_id
  );

  -- Talking Character Video Recipe
  INSERT INTO public.recipes (
    domain_id, title, recipe_slug, objective, category_id, variant_type_id,
    constraints, default_parameters, quality_checks, status
  )
  SELECT comfy_id, 'Talking Character Video Recipe', 'talking_character_video',
    'Generate a talking-head or lip-synced clip with stable identity.',
    cat_talk, var_cine,
    '{"min_frames":48,"fps":24}'::jsonb,
    '{"motion_strength":"low"}'::jsonb,
    '{"checks":["lip_sync","temporal_stability"]}'::jsonb,
    active_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.recipes WHERE recipe_slug = 'talking_character_video' AND domain_id = comfy_id
  );
END $$;
