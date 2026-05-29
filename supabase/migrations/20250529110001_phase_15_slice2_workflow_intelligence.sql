-- CKOS Phase 1.5 Slice 2: Workflow Intelligence (additive only)

-- ---------------------------------------------------------------------------
-- Lookup tables (database-driven taxonomy)
-- ---------------------------------------------------------------------------

CREATE TABLE public.workflow_purposes (
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

CREATE TABLE public.complexity_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  min_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE TABLE public.hardware_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  min_vram_gb INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

-- Purpose detection signals (DB-driven rules, not app enums)
CREATE TABLE public.workflow_purpose_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_purpose_id UUID NOT NULL REFERENCES public.workflow_purposes(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  weight NUMERIC(5, 2) NOT NULL DEFAULT 1.0,
  match_target TEXT NOT NULL DEFAULT 'class_type',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX workflow_purpose_signals_purpose_idx
  ON public.workflow_purpose_signals (workflow_purpose_id);

-- ---------------------------------------------------------------------------
-- Workflow graph edges
-- ---------------------------------------------------------------------------

CREATE TABLE public.workflow_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  from_node_key TEXT NOT NULL,
  to_node_key TEXT NOT NULL,
  input_slot TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (workflow_id, from_node_key, to_node_key, input_slot)
);

CREATE INDEX workflow_edges_workflow_idx ON public.workflow_edges (workflow_id);
CREATE INDEX workflow_edges_to_idx ON public.workflow_edges (workflow_id, to_node_key);

-- ---------------------------------------------------------------------------
-- Workflow analysis results
-- ---------------------------------------------------------------------------

CREATE TABLE public.workflow_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  complexity_score NUMERIC(6, 2) NOT NULL,
  complexity_level_id UUID NOT NULL REFERENCES public.complexity_levels(id),
  workflow_purpose_id UUID NOT NULL REFERENCES public.workflow_purposes(id),
  hardware_requirement_id UUID NOT NULL REFERENCES public.hardware_tiers(id),
  node_count INT NOT NULL DEFAULT 0,
  custom_node_count INT NOT NULL DEFAULT 0,
  model_count INT NOT NULL DEFAULT 0,
  controlnet_count INT NOT NULL DEFAULT 0,
  lora_count INT NOT NULL DEFAULT 0,
  video_capable BOOLEAN NOT NULL DEFAULT false,
  graph_depth INT NOT NULL DEFAULT 0,
  branch_count INT NOT NULL DEFAULT 0,
  upscale_stage_count INT NOT NULL DEFAULT 0,
  analysis_version TEXT NOT NULL DEFAULT '1.0.0',
  analysis_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX workflow_analysis_current_idx
  ON public.workflow_analysis (workflow_id)
  WHERE is_current = true;

CREATE INDEX workflow_analysis_workflow_idx ON public.workflow_analysis (workflow_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_workflow_purposes_updated_at
  BEFORE UPDATE ON public.workflow_purposes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_complexity_levels_updated_at
  BEFORE UPDATE ON public.complexity_levels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_hardware_tiers_updated_at
  BEFORE UPDATE ON public.hardware_tiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_workflow_purpose_signals_updated_at
  BEFORE UPDATE ON public.workflow_purpose_signals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_workflow_edges_updated_at
  BEFORE UPDATE ON public.workflow_edges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_workflow_analysis_updated_at
  BEFORE UPDATE ON public.workflow_analysis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.workflow_purposes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complexity_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hardware_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_purpose_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_purposes_read" ON public.workflow_purposes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "complexity_levels_read" ON public.complexity_levels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "hardware_tiers_read" ON public.hardware_tiers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "workflow_purpose_signals_read" ON public.workflow_purpose_signals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "workflow_edges_all" ON public.workflow_edges
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "workflow_analysis_all" ON public.workflow_analysis
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------

INSERT INTO public.workflow_purposes (code, label, description, sort_order) VALUES
  ('character_consistency', 'Character Consistency', 'IPAdapter / reference-driven identity', 10),
  ('poster', 'Poster', 'Poster and layout compositions', 20),
  ('marketing_asset', 'Marketing Asset', 'Ads, banners, promo creatives', 30),
  ('video', 'Video', 'Video generation pipelines', 40),
  ('talking_character', 'Talking Character', 'Lip-sync and talking head workflows', 50),
  ('upscale', 'Upscale', 'Upscaling and enhancement chains', 60),
  ('product_mockup', 'Product Mockup', 'Product and merch mockups', 70),
  ('image_editing', 'Image Editing', 'Inpaint, kontext, regional edit', 80),
  ('animation', 'Animation', 'Animation and motion pipelines', 90),
  ('research', 'Research', 'Experimental or R&D graphs', 100),
  ('unknown', 'Unknown', 'Could not infer purpose', 999);

INSERT INTO public.complexity_levels (code, label, min_score, sort_order) VALUES
  ('simple', 'Simple', 0, 10),
  ('intermediate', 'Intermediate', 25, 20),
  ('advanced', 'Advanced', 50, 30),
  ('expert', 'Expert', 75, 40);

INSERT INTO public.hardware_tiers (code, label, min_vram_gb, sort_order) VALUES
  ('tier_8gb', '8GB', 8, 10),
  ('tier_12gb', '12GB', 12, 20),
  ('tier_16gb', '16GB', 16, 30),
  ('tier_24gb', '24GB', 24, 40),
  ('tier_48gb', '48GB+', 48, 50);

-- Purpose signals (pattern matched case-insensitively against class_type)
INSERT INTO public.workflow_purpose_signals (workflow_purpose_id, pattern, weight)
SELECT p.id, s.pattern, s.weight
FROM (VALUES
  ('video', 'wan', 3.0),
  ('video', 'framepack', 3.0),
  ('video', 'animatediff', 3.0),
  ('video', 'svd', 2.5),
  ('video', 'hunyuan', 2.5),
  ('video', 'ltxv', 2.5),
  ('video', 'mochi', 2.5),
  ('video', 'videocombine', 2.0),
  ('video', 'vhs_', 2.0),
  ('video', 'video', 1.5),
  ('talking_character', 'wav2lip', 3.0),
  ('talking_character', 'sadtalker', 3.0),
  ('talking_character', 'lip', 2.0),
  ('character_consistency', 'ipadapter', 3.0),
  ('character_consistency', 'reference', 1.5),
  ('character_consistency', 'pulid', 2.5),
  ('character_consistency', 'instantid', 2.5),
  ('upscale', 'upscale', 2.5),
  ('upscale', 'esrgan', 2.0),
  ('upscale', 'ultimatesdupscale', 3.0),
  ('poster', 'text', 1.0),
  ('poster', 'poster', 2.5),
  ('marketing_asset', 'banner', 2.0),
  ('marketing_asset', 'marketing', 2.5),
  ('product_mockup', 'mockup', 2.5),
  ('product_mockup', 'product', 1.5),
  ('image_editing', 'inpaint', 2.5),
  ('image_editing', 'kontext', 2.5),
  ('image_editing', 'fill', 1.5),
  ('animation', 'animate', 2.0),
  ('research', 'preview', 0.5)
) AS s(purpose_code, pattern, weight)
JOIN public.workflow_purposes p ON p.code = s.purpose_code;

DO $$
DECLARE active_id UUID;
BEGIN
  SELECT public.active_status_id() INTO active_id;
  UPDATE public.workflow_purposes SET status = active_id WHERE status IS NULL;
  UPDATE public.complexity_levels SET status = active_id WHERE status IS NULL;
  UPDATE public.hardware_tiers SET status = active_id WHERE status IS NULL;
  UPDATE public.workflow_purpose_signals SET status = active_id WHERE status IS NULL;
END $$;
