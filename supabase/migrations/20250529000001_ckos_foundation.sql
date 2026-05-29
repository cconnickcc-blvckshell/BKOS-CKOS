-- CKOS Phase 1: Foundation schema
-- Comfy Knowledge Operating System — extensible, database-driven, RBAC-ready

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Shared primitives (never hardcode in application code)
-- ---------------------------------------------------------------------------

CREATE TABLE public.status_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (domain, code)
);

CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  default_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

-- Seed status types (bootstrap only; app reads from DB)
INSERT INTO public.status_types (domain, code, label, sort_order) VALUES
  ('entity', 'draft', 'Draft', 10),
  ('entity', 'active', 'Active', 20),
  ('entity', 'archived', 'Archived', 30),
  ('entity', 'deprecated', 'Deprecated', 40);

-- Link self-referential status on status_types to active
UPDATE public.status_types st
SET status = (SELECT id FROM public.status_types WHERE domain = 'entity' AND code = 'active' LIMIT 1);

-- ---------------------------------------------------------------------------
-- Module 1: Source Acquisition
-- ---------------------------------------------------------------------------

CREATE TABLE public.source_types (
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

CREATE TABLE public.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_type_id UUID NOT NULL REFERENCES public.source_types(id),
  title TEXT NOT NULL,
  url TEXT,
  external_id TEXT,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(4, 3) CHECK (confidence >= 0 AND confidence <= 1),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE TABLE public.source_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  content TEXT,
  content_hash TEXT,
  change_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (source_id, version_number)
);

-- ---------------------------------------------------------------------------
-- Module 2: Knowledge Normalization
-- ---------------------------------------------------------------------------

CREATE TABLE public.knowledge_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  schema_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE TABLE public.knowledge_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  knowledge_type_id UUID NOT NULL REFERENCES public.knowledge_types(id),
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  source_version_id UUID REFERENCES public.source_versions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT,
  summary TEXT,
  structured_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(4, 3) CHECK (confidence >= 0 AND confidence <= 1),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(structured_data::text, '')), 'C')
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX knowledge_records_search_idx ON public.knowledge_records USING GIN (search_vector);
CREATE INDEX knowledge_records_type_idx ON public.knowledge_records (knowledge_type_id);
CREATE INDEX knowledge_records_org_idx ON public.knowledge_records (organization_id);

-- ---------------------------------------------------------------------------
-- Module 3: Knowledge Graph
-- ---------------------------------------------------------------------------

CREATE TABLE public.relationship_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  inverse_type_id UUID REFERENCES public.relationship_types(id) ON DELETE SET NULL,
  is_directional BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE TABLE public.knowledge_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_record_id UUID NOT NULL REFERENCES public.knowledge_records(id) ON DELETE CASCADE,
  to_record_id UUID NOT NULL REFERENCES public.knowledge_records(id) ON DELETE CASCADE,
  relationship_type_id UUID NOT NULL REFERENCES public.relationship_types(id),
  weight NUMERIC(5, 4) DEFAULT 1.0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  CHECK (from_record_id <> to_record_id),
  UNIQUE (from_record_id, to_record_id, relationship_type_id)
);

CREATE INDEX knowledge_relationships_from_idx ON public.knowledge_relationships (from_record_id);
CREATE INDEX knowledge_relationships_to_idx ON public.knowledge_relationships (to_record_id);

-- ---------------------------------------------------------------------------
-- Module 5: Workflow Intelligence
-- ---------------------------------------------------------------------------

CREATE TABLE public.workflow_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE TABLE public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.workflow_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  workflow_json JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  node_count INT,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(workflow_json::text, '')), 'C')
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX workflows_search_idx ON public.workflows USING GIN (search_vector);

CREATE TABLE public.workflow_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  class_type TEXT NOT NULL,
  node_type TEXT,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  outputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (workflow_id, node_key)
);

-- ---------------------------------------------------------------------------
-- Module 6: Failure Analysis
-- ---------------------------------------------------------------------------

CREATE TABLE public.failure_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  symptom TEXT NOT NULL,
  causes JSONB NOT NULL DEFAULT '[]'::jsonb,
  probability JSONB NOT NULL DEFAULT '[]'::jsonb,
  fixes JSONB NOT NULL DEFAULT '[]'::jsonb,
  reference_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(symptom, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(causes::text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(fixes::text, '')), 'C')
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX failure_records_search_idx ON public.failure_records USING GIN (search_vector);

-- ---------------------------------------------------------------------------
-- Module 7: Studio Recipes
-- ---------------------------------------------------------------------------

CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  goal TEXT,
  constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  knowledge_record_ids UUID[] NOT NULL DEFAULT '{}',
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(goal, '')), 'C')
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX recipes_search_idx ON public.recipes USING GIN (search_vector);

-- ---------------------------------------------------------------------------
-- Tags (polymorphic)
-- ---------------------------------------------------------------------------

CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (organization_id, slug)
);

CREATE TABLE public.entity_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (tag_id, entity_type, entity_id)
);

CREATE INDEX entity_tags_entity_idx ON public.entity_tags (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Vector embeddings (unified store)
-- ---------------------------------------------------------------------------

CREATE TABLE public.embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  content_text TEXT NOT NULL,
  embedding extensions.vector(1536),
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL,
  UNIQUE (entity_type, entity_id, chunk_index)
);

CREATE INDEX embeddings_entity_idx ON public.embeddings (entity_type, entity_id);
CREATE INDEX embeddings_vector_idx ON public.embeddings
  USING hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Audit logs
-- ---------------------------------------------------------------------------

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  status UUID REFERENCES public.status_types(id) ON DELETE SET NULL
);

CREATE INDEX audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_actor_idx ON public.audit_logs (actor_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'status_types', 'organizations', 'profiles', 'source_types', 'sources',
      'source_versions', 'knowledge_types', 'knowledge_records',
      'relationship_types', 'knowledge_relationships', 'workflow_categories',
      'workflows', 'workflow_nodes', 'failure_records', 'recipes', 'tags',
      'entity_tags', 'embeddings', 'audit_logs'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_%s_updated_at BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t, t
    );
  END LOOP;
END $$;

-- Profile bootstrap on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, created_by)
  VALUES (NEW.id, coalesce(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
