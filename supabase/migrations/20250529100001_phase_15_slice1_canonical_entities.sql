-- CKOS Phase 1.5 Slice 1: Canonical entity system (additive only)

-- ---------------------------------------------------------------------------
-- Knowledge domains (multi-domain expansion)
-- ---------------------------------------------------------------------------

CREATE TABLE public.knowledge_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Entity types (database-driven — no app enums)
-- ---------------------------------------------------------------------------

CREATE TABLE public.entity_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  metadata_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Canonical entities
-- ---------------------------------------------------------------------------

CREATE TABLE public.entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.knowledge_domains(id) ON DELETE RESTRICT,
  entity_type_id UUID NOT NULL REFERENCES public.entity_types(id) ON DELETE RESTRICT,
  canonical_slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  CONSTRAINT entities_slug_format CHECK (canonical_slug ~ '^[a-z0-9_]+$'),
  UNIQUE (domain_id, canonical_slug)
);

CREATE INDEX entities_domain_idx ON public.entities (domain_id);
CREATE INDEX entities_type_idx ON public.entities (entity_type_id);
CREATE INDEX entities_display_name_trgm_idx ON public.entities USING gin (display_name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Entity aliases (denormalized domain_id for fast unique resolution)
-- ---------------------------------------------------------------------------

CREATE TABLE public.entity_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES public.knowledge_domains(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  source TEXT,
  confidence NUMERIC(4, 3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (domain_id, alias_normalized),
  UNIQUE (entity_id, alias_normalized)
);

CREATE INDEX entity_aliases_entity_idx ON public.entity_aliases (entity_id);
CREATE INDEX entity_aliases_normalized_idx ON public.entity_aliases (domain_id, alias_normalized);

-- Keep domain_id in sync with parent entity
CREATE OR REPLACE FUNCTION public.sync_entity_alias_domain()
RETURNS TRIGGER AS $$
BEGIN
  SELECT e.domain_id INTO NEW.domain_id
  FROM public.entities e
  WHERE e.id = NEW.entity_id;
  IF NEW.domain_id IS NULL THEN
    RAISE EXCEPTION 'entity_id % not found', NEW.entity_id;
  END IF;
  NEW.alias_normalized := public.normalize_entity_alias(NEW.alias);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entity_aliases_sync_domain
  BEFORE INSERT OR UPDATE OF alias, entity_id ON public.entity_aliases
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_alias_domain();

-- ---------------------------------------------------------------------------
-- Domain bridges (nullable — safe additive)
-- ---------------------------------------------------------------------------

ALTER TABLE public.knowledge_records
  ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.knowledge_domains(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES public.entities(id) ON DELETE SET NULL;

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.knowledge_domains(id) ON DELETE SET NULL;

ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.knowledge_domains(id) ON DELETE SET NULL;

ALTER TABLE public.failure_records
  ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.knowledge_domains(id) ON DELETE SET NULL;

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.knowledge_domains(id) ON DELETE SET NULL;

CREATE INDEX knowledge_records_entity_idx ON public.knowledge_records (entity_id);
CREATE INDEX knowledge_records_domain_idx ON public.knowledge_records (domain_id);
CREATE INDEX sources_domain_idx ON public.sources (domain_id);
CREATE INDEX workflows_domain_idx ON public.workflows (domain_id);

-- ---------------------------------------------------------------------------
-- Alias normalization + resolution (database resolver)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_entity_alias(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    lower(
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(coalesce(raw, ''), '_', ' ', 'g'),
            '\s+',
            ' ',
            'g'
          ),
          '[^a-zA-Z0-9 ]',
          '',
          'g'
        )
      )
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.resolve_entity_alias(
  p_domain_code TEXT,
  p_alias TEXT
)
RETURNS TABLE (
  entity_id UUID,
  canonical_slug TEXT,
  display_name TEXT,
  entity_type_code TEXT,
  matched_alias TEXT,
  match_type TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_domain_id UUID;
  v_normalized TEXT;
BEGIN
  v_normalized := public.normalize_entity_alias(p_alias);
  IF v_normalized IS NULL THEN
    RETURN;
  END IF;

  SELECT kd.id INTO v_domain_id
  FROM public.knowledge_domains kd
  WHERE kd.code = p_domain_code;

  IF v_domain_id IS NULL THEN
    RAISE EXCEPTION 'Unknown knowledge domain: %', p_domain_code;
  END IF;

  -- 1) Exact alias match
  RETURN QUERY
  SELECT
    e.id,
    e.canonical_slug,
    e.display_name,
    et.code,
    ea.alias,
    'alias_exact'::TEXT
  FROM public.entity_aliases ea
  JOIN public.entities e ON e.id = ea.entity_id
  JOIN public.entity_types et ON et.id = e.entity_type_id
  WHERE ea.domain_id = v_domain_id
    AND ea.alias_normalized = v_normalized
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- 2) Canonical slug match (slug uses underscores; normalize maps spaces away)
  RETURN QUERY
  SELECT
    e.id,
    e.canonical_slug,
    e.display_name,
    et.code,
    e.canonical_slug,
    'slug_exact'::TEXT
  FROM public.entities e
  JOIN public.entity_types et ON et.id = e.entity_type_id
  WHERE e.domain_id = v_domain_id
    AND (
      e.canonical_slug = replace(v_normalized, ' ', '_')
      OR replace(e.canonical_slug, '_', ' ') = v_normalized
    )
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- 3) Trigram fuzzy alias match (requires pg_trgm)
  RETURN QUERY
  SELECT
    e.id,
    e.canonical_slug,
    e.display_name,
    et.code,
    ea.alias,
    'alias_fuzzy'::TEXT
  FROM public.entity_aliases ea
  JOIN public.entities e ON e.id = ea.entity_id
  JOIN public.entity_types et ON et.id = e.entity_type_id
  WHERE ea.domain_id = v_domain_id
    AND similarity(ea.alias_normalized, v_normalized) > 0.45
  ORDER BY similarity(ea.alias_normalized, v_normalized) DESC
  LIMIT 1;
END;
$$;

-- ---------------------------------------------------------------------------
-- updated_at triggers for new tables
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_knowledge_domains_updated_at
  BEFORE UPDATE ON public.knowledge_domains
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_entity_types_updated_at
  BEFORE UPDATE ON public.entity_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_entities_updated_at
  BEFORE UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_entity_aliases_updated_at
  BEFORE UPDATE ON public.entity_aliases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.knowledge_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_domains_read" ON public.knowledge_domains
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "entity_types_read" ON public.entity_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "entities_all" ON public.entities
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "entity_aliases_all" ON public.entity_aliases
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

GRANT EXECUTE ON FUNCTION public.normalize_entity_alias(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_entity_alias(TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed: domains, entity types, canonical examples (ComfyUI first domain)
-- ---------------------------------------------------------------------------

INSERT INTO public.knowledge_domains (code, label, description) VALUES
  ('comfyui', 'ComfyUI', 'ComfyUI nodes, workflows, and generation stack'),
  ('runway', 'Runway', 'Runway video and image APIs'),
  ('kling', 'Kling', 'Kling video generation'),
  ('marketing', 'Marketing', 'Marketing and promo content systems'),
  ('events', 'Events', 'Event flyers and campaigns'),
  ('merch', 'Merch', 'Merchandise and product mockups');

INSERT INTO public.entity_types (code, label, description) VALUES
  ('node', 'Node', 'ComfyUI or pipeline node'),
  ('model', 'Model', 'Checkpoint or diffusion model'),
  ('control_system', 'Control System', 'ControlNet, IPAdapter, etc.'),
  ('workflow_pattern', 'Workflow Pattern', 'Reusable workflow composition'),
  ('failure_signature', 'Failure Signature', 'Known failure pattern'),
  ('recipe_template', 'Recipe Template', 'Studio recipe template'),
  ('concept', 'Concept', 'Abstract technique or idea');

DO $$
DECLARE
  active_id UUID;
  comfy_id UUID;
  control_type_id UUID;
  model_type_id UUID;
  openpose_id UUID;
  flux_dev_id UUID;
BEGIN
  SELECT public.active_status_id() INTO active_id;
  SELECT id INTO comfy_id FROM public.knowledge_domains WHERE code = 'comfyui';
  SELECT id INTO control_type_id FROM public.entity_types WHERE code = 'control_system';
  SELECT id INTO model_type_id FROM public.entity_types WHERE code = 'model';

  UPDATE public.knowledge_domains SET status = active_id WHERE status IS NULL;
  UPDATE public.entity_types SET status = active_id WHERE status IS NULL;

  INSERT INTO public.entities (domain_id, entity_type_id, canonical_slug, display_name, description, status)
  VALUES
    (comfy_id, control_type_id, 'openpose_controlnet', 'OpenPose ControlNet', 'OpenPose-guided ControlNet control stack', active_id),
    (comfy_id, model_type_id, 'flux_dev', 'Flux Dev', 'FLUX.1 dev checkpoint family', active_id),
    (comfy_id, model_type_id, 'flux_kontext', 'Flux Kontext', 'FLUX Kontext editing model', active_id),
    (comfy_id, model_type_id, 'wan22', 'Wan 2.2', 'Wan 2.2 video generation model', active_id)
  ON CONFLICT (domain_id, canonical_slug) DO NOTHING;

  SELECT id INTO openpose_id FROM public.entities WHERE domain_id = comfy_id AND canonical_slug = 'openpose_controlnet';
  SELECT id INTO flux_dev_id FROM public.entities WHERE domain_id = comfy_id AND canonical_slug = 'flux_dev';

  INSERT INTO public.entity_aliases (entity_id, domain_id, alias, source, confidence, status)
  VALUES
    (openpose_id, comfy_id, 'OpenPose', 'seed', 1.0, active_id),
    (openpose_id, comfy_id, 'Open Pose', 'seed', 1.0, active_id),
    (openpose_id, comfy_id, 'OpenPose ControlNet', 'seed', 1.0, active_id),
    (flux_dev_id, comfy_id, 'Flux Dev', 'seed', 1.0, active_id),
    (flux_dev_id, comfy_id, 'FLUX Dev', 'seed', 1.0, active_id),
    (flux_dev_id, comfy_id, 'flux.1 dev', 'seed', 0.95, active_id)
  ON CONFLICT (domain_id, alias_normalized) DO NOTHING;
END $$;
