-- CKOS Phase 2 Slice 7: Knowledge gap detection (additive only)

-- ---------------------------------------------------------------------------
-- Lookup tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.gap_statuses (
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

CREATE TABLE public.gap_severity_levels (
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

CREATE TABLE public.gap_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  default_severity_code TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Knowledge gaps
-- ---------------------------------------------------------------------------

CREATE TABLE public.knowledge_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_type_id UUID NOT NULL REFERENCES public.gap_types(id),
  status_id UUID NOT NULL REFERENCES public.gap_statuses(id),
  severity_id UUID NOT NULL REFERENCES public.gap_severity_levels(id),
  domain_id UUID REFERENCES public.knowledge_domains(id) ON DELETE SET NULL,
  entity_id UUID REFERENCES public.entities(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.curation_campaigns(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  detection_source TEXT NOT NULL CHECK (detection_source IN ('manual', 'system', 'campaign')),
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX knowledge_gaps_status_idx ON public.knowledge_gaps (status_id, severity_id);
CREATE INDEX knowledge_gaps_domain_idx ON public.knowledge_gaps (domain_id, created_at DESC);
CREATE INDEX knowledge_gaps_entity_idx ON public.knowledge_gaps (entity_id);
CREATE INDEX knowledge_gaps_campaign_idx ON public.knowledge_gaps (campaign_id);

-- ---------------------------------------------------------------------------
-- Evidence (required for every gap)
-- ---------------------------------------------------------------------------

CREATE TABLE public.knowledge_gap_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_gap_id UUID NOT NULL REFERENCES public.knowledge_gaps(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  linked_entity_type TEXT,
  linked_entity_id UUID,
  evidence_summary TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX knowledge_gap_evidence_gap_idx
  ON public.knowledge_gap_evidence (knowledge_gap_id, sort_order);

-- ---------------------------------------------------------------------------
-- Links
-- ---------------------------------------------------------------------------

CREATE TABLE public.campaign_gap_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.curation_campaigns(id) ON DELETE CASCADE,
  knowledge_gap_id UUID NOT NULL REFERENCES public.knowledge_gaps(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (campaign_id, knowledge_gap_id)
);

CREATE TABLE public.entity_gap_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  knowledge_gap_id UUID NOT NULL REFERENCES public.knowledge_gaps(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (entity_id, knowledge_gap_id)
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_gap_statuses_updated_at
  BEFORE UPDATE ON public.gap_statuses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_gap_severity_levels_updated_at
  BEFORE UPDATE ON public.gap_severity_levels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_gap_types_updated_at
  BEFORE UPDATE ON public.gap_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_knowledge_gaps_updated_at
  BEFORE UPDATE ON public.knowledge_gaps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_knowledge_gap_evidence_updated_at
  BEFORE UPDATE ON public.knowledge_gap_evidence
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.gap_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gap_severity_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gap_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_gap_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_gap_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_gap_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gap_statuses_read" ON public.gap_statuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "gap_severity_levels_read" ON public.gap_severity_levels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "gap_types_read" ON public.gap_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "knowledge_gaps_all" ON public.knowledge_gaps
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "knowledge_gap_evidence_all" ON public.knowledge_gap_evidence
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "campaign_gap_links_all" ON public.campaign_gap_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "entity_gap_links_all" ON public.entity_gap_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------

INSERT INTO public.gap_statuses (code, label, sort_order, description) VALUES
  ('open', 'Open', 10, 'Gap identified; not yet addressed'),
  ('investigating', 'Investigating', 20, 'Under review'),
  ('source_needed', 'Source Needed', 30, 'Requires trusted source acquisition'),
  ('normalization_needed', 'Normalization Needed', 40, 'Requires normalization / review'),
  ('resolved', 'Resolved', 50, 'Gap addressed'),
  ('dismissed', 'Dismissed', 60, 'Accepted risk or not applicable')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.gap_severity_levels (code, label, sort_order, description) VALUES
  ('low', 'Low', 10, 'Minor coverage gap'),
  ('medium', 'Medium', 20, 'Notable gap'),
  ('high', 'High', 30, 'Important missing coverage'),
  ('critical', 'Critical', 40, 'Blocks reliable decisions')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.gap_types (code, label, description, default_severity_code, sort_order) VALUES
  ('missing_entity', 'Missing Entity', 'Target entity has no knowledge records', 'high', 10),
  ('missing_failure_modes', 'Missing Failure Modes', 'Entity knowledge lacks failure coverage', 'medium', 20),
  ('missing_recipe', 'Missing Recipe', 'No recipe linked for entity/topic', 'medium', 30),
  ('missing_workflow', 'Missing Workflow', 'No workflow linked for entity/topic', 'medium', 40),
  ('missing_citations', 'Missing Citations', 'Knowledge lacks source version / citations', 'high', 50),
  ('weak_confidence', 'Weak Confidence', 'Approved records below confidence threshold', 'medium', 60),
  ('stale_source', 'Stale Source', 'Source versions exceed freshness threshold', 'medium', 70),
  ('duplicate_conflict', 'Duplicate Conflict', 'Potential duplicate or conflicting records', 'low', 80),
  ('missing_hardware_notes', 'Missing Hardware Notes', 'Model/workflow lacks hardware guidance', 'low', 90),
  ('missing_model_compatibility', 'Missing Model Compatibility', 'Model compatibility not documented', 'medium', 100)
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE active_id UUID;
BEGIN
  SELECT public.active_status_id() INTO active_id;
  UPDATE public.gap_statuses SET status = active_id WHERE status IS NULL;
  UPDATE public.gap_severity_levels SET status = active_id WHERE status IS NULL;
  UPDATE public.gap_types SET status = active_id WHERE status IS NULL;
END $$;
