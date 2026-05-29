-- CKOS Phase 2 Slice 8: Source discovery suggestions (additive only)

-- ---------------------------------------------------------------------------
-- Lookup tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.discovery_statuses (
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

CREATE TABLE public.discovery_suggestion_sources (
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
-- Suggestions (reviewable; never auto-fetch)
-- ---------------------------------------------------------------------------

CREATE TABLE public.source_discovery_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.knowledge_domains(id),
  knowledge_gap_id UUID REFERENCES public.knowledge_gaps(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.curation_campaigns(id) ON DELETE CASCADE,
  suggested_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  title TEXT,
  reason TEXT NOT NULL,
  confidence_score NUMERIC(4, 3) NOT NULL DEFAULT 0.5,
  trusted_domain_id UUID NOT NULL REFERENCES public.trusted_source_domains(id),
  suggestion_source_id UUID NOT NULL REFERENCES public.discovery_suggestion_sources(id),
  status_id UUID NOT NULL REFERENCES public.discovery_statuses(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  CONSTRAINT discovery_suggestion_gap_or_campaign CHECK (
    knowledge_gap_id IS NOT NULL OR campaign_id IS NOT NULL
  )
);

CREATE INDEX source_discovery_suggestions_gap_idx
  ON public.source_discovery_suggestions (knowledge_gap_id, created_at DESC);

CREATE INDEX source_discovery_suggestions_campaign_idx
  ON public.source_discovery_suggestions (campaign_id, created_at DESC);

CREATE INDEX source_discovery_suggestions_status_idx
  ON public.source_discovery_suggestions (status_id);

CREATE UNIQUE INDEX source_discovery_suggestions_dedupe_idx
  ON public.source_discovery_suggestions (normalized_url, COALESCE(knowledge_gap_id, campaign_id));

-- ---------------------------------------------------------------------------
-- Gap ↔ suggestion links
-- ---------------------------------------------------------------------------

CREATE TABLE public.gap_discovery_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_gap_id UUID NOT NULL REFERENCES public.knowledge_gaps(id) ON DELETE CASCADE,
  source_discovery_suggestion_id UUID NOT NULL REFERENCES public.source_discovery_suggestions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (knowledge_gap_id, source_discovery_suggestion_id)
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_discovery_statuses_updated_at
  BEFORE UPDATE ON public.discovery_statuses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_discovery_suggestion_sources_updated_at
  BEFORE UPDATE ON public.discovery_suggestion_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_source_discovery_suggestions_updated_at
  BEFORE UPDATE ON public.source_discovery_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.discovery_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_suggestion_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_discovery_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gap_discovery_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discovery_statuses_read" ON public.discovery_statuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "discovery_suggestion_sources_read" ON public.discovery_suggestion_sources
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "source_discovery_suggestions_all" ON public.source_discovery_suggestions
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "gap_discovery_links_all" ON public.gap_discovery_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------

INSERT INTO public.discovery_statuses (code, label, sort_order, description) VALUES
  ('proposed', 'Proposed', 10, 'Awaiting human review'),
  ('approved', 'Approved', 20, 'Approved; may be added to campaign'),
  ('rejected', 'Rejected', 30, 'Rejected by reviewer'),
  ('added_to_campaign', 'Added to Campaign', 40, 'URL added to campaign sources'),
  ('dismissed', 'Dismissed', 50, 'Dismissed without action')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.discovery_suggestion_sources (code, label, sort_order, description) VALUES
  ('manual', 'Manual', 10, 'Entered by user'),
  ('search_query', 'Search Query', 20, 'Trusted-domain search target URL'),
  ('known_trusted_domain', 'Known Trusted Domain', 30, 'Existing CKOS source on allowlist'),
  ('related_source_links', 'Related Source Links', 40, 'Link from campaign extraction'),
  ('campaign_gap_analysis', 'Campaign Gap Analysis', 50, 'Generated from gap analysis')
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE active_id UUID;
BEGIN
  SELECT public.active_status_id() INTO active_id;
  UPDATE public.discovery_statuses SET status = active_id WHERE status IS NULL;
  UPDATE public.discovery_suggestion_sources SET status = active_id WHERE status IS NULL;
END $$;
