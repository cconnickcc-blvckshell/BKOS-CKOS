-- CKOS Phase 2 Slice 1: Source Acquisition Engine (additive only)

-- ---------------------------------------------------------------------------
-- Lookup: acquisition statuses
-- ---------------------------------------------------------------------------

CREATE TABLE public.acquisition_statuses (
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
-- Trusted domains & crawl policies
-- ---------------------------------------------------------------------------

CREATE TABLE public.trusted_source_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  allow_subdomains BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE TABLE public.source_crawl_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trusted_domain_id UUID NOT NULL REFERENCES public.trusted_source_domains(id) ON DELETE CASCADE,
  max_response_bytes INT NOT NULL DEFAULT 5242880,
  fetch_timeout_ms INT NOT NULL DEFAULT 30000,
  respect_robots_txt BOOLEAN NOT NULL DEFAULT true,
  user_agent TEXT NOT NULL DEFAULT 'CKOS-SourceAcquisition/1.0 (+https://github.com/cconnickcc-blvckshell/BKOS-CKOS)',
  allowed_content_types TEXT[] NOT NULL DEFAULT ARRAY[
    'text/html',
    'text/plain',
    'text/markdown',
    'application/json'
  ],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (trusted_domain_id)
);

-- ---------------------------------------------------------------------------
-- Fetch jobs
-- ---------------------------------------------------------------------------

CREATE TABLE public.source_fetch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  requested_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  status_id UUID NOT NULL REFERENCES public.acquisition_statuses(id),
  http_status INT,
  content_type TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX source_fetch_jobs_source_idx ON public.source_fetch_jobs (source_id, created_at DESC);
CREATE INDEX source_fetch_jobs_status_idx ON public.source_fetch_jobs (status_id);

-- ---------------------------------------------------------------------------
-- Extend source_versions (raw snapshot + job link)
-- ---------------------------------------------------------------------------

ALTER TABLE public.source_versions
  ADD COLUMN IF NOT EXISTS raw_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_content_type TEXT,
  ADD COLUMN IF NOT EXISTS source_fetch_job_id UUID REFERENCES public.source_fetch_jobs(id) ON DELETE SET NULL;

CREATE INDEX source_versions_fetch_job_idx ON public.source_versions (source_fetch_job_id);

-- Immutability: content snapshots cannot be altered after insert
CREATE OR REPLACE FUNCTION public.prevent_source_version_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.content IS DISTINCT FROM NEW.content
       OR OLD.raw_snapshot IS DISTINCT FROM NEW.raw_snapshot
       OR OLD.content_hash IS DISTINCT FROM NEW.content_hash
       OR OLD.version_number IS DISTINCT FROM NEW.version_number
       OR OLD.source_id IS DISTINCT FROM NEW.source_id
       OR OLD.snapshot_content_type IS DISTINCT FROM NEW.snapshot_content_type
       OR OLD.source_fetch_job_id IS DISTINCT FROM NEW.source_fetch_job_id
    THEN
      RAISE EXCEPTION 'source_versions snapshots are immutable after creation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS source_versions_immutable_snapshot ON public.source_versions;
CREATE TRIGGER source_versions_immutable_snapshot
  BEFORE UPDATE ON public.source_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_source_version_snapshot_mutation();

-- ---------------------------------------------------------------------------
-- Extraction results
-- ---------------------------------------------------------------------------

CREATE TABLE public.source_extraction_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_version_id UUID NOT NULL REFERENCES public.source_versions(id) ON DELETE CASCADE,
  title TEXT,
  canonical_url TEXT,
  summary TEXT,
  headings JSONB NOT NULL DEFAULT '[]'::jsonb,
  links JSONB NOT NULL DEFAULT '[]'::jsonb,
  code_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_markdown TEXT,
  extracted_text TEXT,
  extraction_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_status_id UUID NOT NULL REFERENCES public.acquisition_statuses(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (source_version_id)
);

CREATE INDEX source_extraction_results_version_idx
  ON public.source_extraction_results (source_version_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_acquisition_statuses_updated_at
  BEFORE UPDATE ON public.acquisition_statuses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_trusted_source_domains_updated_at
  BEFORE UPDATE ON public.trusted_source_domains
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_source_crawl_policies_updated_at
  BEFORE UPDATE ON public.source_crawl_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_source_fetch_jobs_updated_at
  BEFORE UPDATE ON public.source_fetch_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_source_extraction_results_updated_at
  BEFORE UPDATE ON public.source_extraction_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.acquisition_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trusted_source_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_crawl_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_fetch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_extraction_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acquisition_statuses_read" ON public.acquisition_statuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "trusted_source_domains_read" ON public.trusted_source_domains
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "source_crawl_policies_read" ON public.source_crawl_policies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "source_fetch_jobs_all" ON public.source_fetch_jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "source_extraction_results_all" ON public.source_extraction_results
  FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------

INSERT INTO public.acquisition_statuses (code, label, sort_order, description) VALUES
  ('pending', 'Pending', 10, 'Job queued, not started'),
  ('in_progress', 'In Progress', 20, 'Fetch or extraction running'),
  ('succeeded', 'Succeeded', 30, 'Completed successfully'),
  ('failed', 'Failed', 40, 'Error or HTTP failure'),
  ('cancelled', 'Cancelled', 50, 'Cancelled by user or system'),
  ('pending_review', 'Pending Review', 60, 'Extracted content awaiting human review'),
  ('reviewed', 'Reviewed', 70, 'Human reviewed extraction (normalization not started)');

INSERT INTO public.trusted_source_domains (domain, label, description, allow_subdomains) VALUES
  ('comfyui-wiki.com', 'ComfyUI Wiki', 'Community ComfyUI wiki', true),
  ('docs.comfy.org', 'ComfyUI Docs', 'Official ComfyUI documentation', true),
  ('github.com', 'GitHub', 'Repositories and documentation on GitHub', true),
  ('raw.githubusercontent.com', 'GitHub Raw', 'Raw file content from GitHub', false),
  ('huggingface.co', 'Hugging Face', 'Model cards and documentation', true),
  ('arxiv.org', 'arXiv', 'Research papers', true);

DO $$
DECLARE
  active_id UUID;
  domain_row RECORD;
BEGIN
  SELECT public.active_status_id() INTO active_id;
  UPDATE public.acquisition_statuses SET status = active_id WHERE status IS NULL;
  UPDATE public.trusted_source_domains SET status = active_id WHERE status IS NULL;

  FOR domain_row IN SELECT id FROM public.trusted_source_domains LOOP
    INSERT INTO public.source_crawl_policies (trusted_domain_id, status)
    SELECT domain_row.id, active_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.source_crawl_policies
      WHERE trusted_domain_id = domain_row.id
    );
  END LOOP;
END $$;
