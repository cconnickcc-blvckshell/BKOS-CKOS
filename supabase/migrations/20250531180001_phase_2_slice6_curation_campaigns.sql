-- CKOS Phase 2 Slice 6: Curation campaigns (additive only)

-- ---------------------------------------------------------------------------
-- Lookup: campaign lifecycle
-- ---------------------------------------------------------------------------

CREATE TABLE public.curation_campaign_statuses (
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
-- Lookup: per-URL pipeline within a campaign
-- ---------------------------------------------------------------------------

CREATE TABLE public.curation_campaign_source_statuses (
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
-- Campaigns
-- ---------------------------------------------------------------------------

CREATE TABLE public.curation_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.knowledge_domains(id),
  title TEXT NOT NULL,
  description TEXT,
  objective TEXT,
  status_id UUID NOT NULL REFERENCES public.curation_campaign_statuses(id),
  target_entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  inclusion_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  exclusion_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX curation_campaigns_domain_idx ON public.curation_campaigns (domain_id, created_at DESC);
CREATE INDEX curation_campaigns_status_idx ON public.curation_campaigns (status_id);

-- ---------------------------------------------------------------------------
-- Campaign sources (trusted URLs only; no crawling)
-- ---------------------------------------------------------------------------

CREATE TABLE public.curation_campaign_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.curation_campaigns(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  source_fetch_job_id UUID REFERENCES public.source_fetch_jobs(id) ON DELETE SET NULL,
  source_extraction_result_id UUID REFERENCES public.source_extraction_results(id) ON DELETE SET NULL,
  normalization_job_id UUID REFERENCES public.normalization_jobs(id) ON DELETE SET NULL,
  status_id UUID NOT NULL REFERENCES public.curation_campaign_source_statuses(id),
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (campaign_id, source_id)
);

CREATE INDEX curation_campaign_sources_campaign_idx
  ON public.curation_campaign_sources (campaign_id, sort_order);

-- ---------------------------------------------------------------------------
-- Campaign outputs (approved / linked CKOS entities)
-- ---------------------------------------------------------------------------

CREATE TABLE public.curation_campaign_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.curation_campaigns(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  output_role TEXT NOT NULL DEFAULT 'approved_knowledge',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (campaign_id, entity_type, entity_id)
);

CREATE INDEX curation_campaign_outputs_campaign_idx
  ON public.curation_campaign_outputs (campaign_id, entity_type);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_curation_campaign_statuses_updated_at
  BEFORE UPDATE ON public.curation_campaign_statuses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_curation_campaign_source_statuses_updated_at
  BEFORE UPDATE ON public.curation_campaign_source_statuses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_curation_campaigns_updated_at
  BEFORE UPDATE ON public.curation_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_curation_campaign_sources_updated_at
  BEFORE UPDATE ON public.curation_campaign_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_curation_campaign_outputs_updated_at
  BEFORE UPDATE ON public.curation_campaign_outputs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.curation_campaign_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curation_campaign_source_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curation_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curation_campaign_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curation_campaign_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "curation_campaign_statuses_read" ON public.curation_campaign_statuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "curation_campaign_source_statuses_read" ON public.curation_campaign_source_statuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "curation_campaigns_all" ON public.curation_campaigns
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "curation_campaign_sources_all" ON public.curation_campaign_sources
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "curation_campaign_outputs_all" ON public.curation_campaign_outputs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------

INSERT INTO public.curation_campaign_statuses (code, label, sort_order, description) VALUES
  ('draft', 'Draft', 10, 'Campaign being defined'),
  ('active', 'Active', 20, 'Actively curating sources'),
  ('paused', 'Paused', 30, 'Paused; no batch actions required'),
  ('completed', 'Completed', 40, 'Curation goals met'),
  ('archived', 'Archived', 50, 'Archived campaign')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.curation_campaign_source_statuses (code, label, sort_order, description) VALUES
  ('pending', 'Pending', 10, 'URL added; fetch not started'),
  ('fetch_pending', 'Fetch Pending', 20, 'Queued for fetch'),
  ('fetched', 'Fetched', 30, 'Fetch succeeded'),
  ('fetch_failed', 'Fetch Failed', 40, 'Fetch failed'),
  ('extraction_ready', 'Extraction Ready', 50, 'Extraction available for normalization'),
  ('normalization_pending', 'Normalization Pending', 60, 'Normalization job created'),
  ('normalization_ready', 'Normalization Ready', 70, 'Draft ready for human review'),
  ('approved', 'Approved', 80, 'Knowledge record published from campaign'),
  ('embedded', 'Embedded', 90, 'Embeddings generated for approved knowledge'),
  ('skipped', 'Skipped', 100, 'Excluded from campaign processing')
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE active_id UUID;
BEGIN
  SELECT public.active_status_id() INTO active_id;
  UPDATE public.curation_campaign_statuses SET status = active_id WHERE status IS NULL;
  UPDATE public.curation_campaign_source_statuses SET status = active_id WHERE status IS NULL;
END $$;
