-- CKOS Phase 1: RLS, search functions, seed data

-- Default active status helper
CREATE OR REPLACE FUNCTION public.active_status_id()
RETURNS UUID AS $$
  SELECT id FROM public.status_types WHERE domain = 'entity' AND code = 'active' LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failure_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_types ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read lookup tables
CREATE POLICY "status_types_read" ON public.status_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "source_types_read" ON public.source_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "knowledge_types_read" ON public.knowledge_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "relationship_types_read" ON public.relationship_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "workflow_categories_read" ON public.workflow_categories FOR SELECT TO authenticated USING (true);

-- Profiles: own row
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- Organizations: members via profile (future RBAC expands here)
CREATE POLICY "organizations_select" ON public.organizations FOR SELECT TO authenticated USING (true);
CREATE POLICY "organizations_insert" ON public.organizations FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- Generic authenticated CRUD for Phase 1 (org-scoped refinement in Phase 2)
CREATE POLICY "sources_all" ON public.sources FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "source_versions_all" ON public.source_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "knowledge_records_all" ON public.knowledge_records FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "knowledge_relationships_all" ON public.knowledge_relationships FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "workflows_all" ON public.workflows FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "workflow_nodes_all" ON public.workflow_nodes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "failure_records_all" ON public.failure_records FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "recipes_all" ON public.recipes FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "tags_all" ON public.tags FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "entity_tags_all" ON public.entity_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "embeddings_all" ON public.embeddings FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid() OR created_by IS NULL);
CREATE POLICY "audit_logs_insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());
CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT TO authenticated USING (actor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Semantic + hybrid search
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.match_embeddings(
  query_embedding extensions.vector(1536),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 20,
  filter_entity_types TEXT[] DEFAULT NULL,
  filter_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  entity_type TEXT,
  entity_id UUID,
  content_text TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.id,
    e.entity_type,
    e.entity_id,
    e.content_text,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.embeddings e
  WHERE e.embedding IS NOT NULL
    AND (filter_entity_types IS NULL OR e.entity_type = ANY(filter_entity_types))
    AND (filter_organization_id IS NULL OR e.organization_id = filter_organization_id)
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.hybrid_search_knowledge(
  search_query TEXT,
  query_embedding extensions.vector(1536) DEFAULT NULL,
  match_count INT DEFAULT 20,
  semantic_weight FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  summary TEXT,
  knowledge_type_id UUID,
  text_rank FLOAT,
  semantic_similarity FLOAT,
  combined_score FLOAT
)
LANGUAGE sql STABLE
AS $$
  WITH text_matches AS (
    SELECT
      kr.id,
      kr.title,
      kr.summary,
      kr.knowledge_type_id,
      ts_rank(kr.search_vector, websearch_to_tsquery('english', search_query)) AS text_rank
    FROM public.knowledge_records kr
    WHERE kr.search_vector @@ websearch_to_tsquery('english', search_query)
  ),
  semantic_matches AS (
    SELECT
      kr.id,
      kr.title,
      kr.summary,
      kr.knowledge_type_id,
      me.similarity AS semantic_similarity
    FROM public.match_embeddings(query_embedding, 0.3, match_count, ARRAY['knowledge_record']) me
    JOIN public.knowledge_records kr ON kr.id = me.entity_id
    WHERE query_embedding IS NOT NULL
  )
  SELECT
    coalesce(t.id, s.id) AS id,
    coalesce(t.title, s.title) AS title,
    coalesce(t.summary, s.summary) AS summary,
    coalesce(t.knowledge_type_id, s.knowledge_type_id) AS knowledge_type_id,
    coalesce(t.text_rank, 0)::FLOAT AS text_rank,
    coalesce(s.semantic_similarity, 0)::FLOAT AS semantic_similarity,
    (
      (1 - semantic_weight) * coalesce(t.text_rank, 0) +
      semantic_weight * coalesce(s.semantic_similarity, 0)
    )::FLOAT AS combined_score
  FROM text_matches t
  FULL OUTER JOIN semantic_matches s ON t.id = s.id
  ORDER BY combined_score DESC
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.expand_knowledge_graph(
  root_record_id UUID,
  max_depth INT DEFAULT 2
)
RETURNS TABLE (
  relationship_id UUID,
  from_record_id UUID,
  to_record_id UUID,
  relationship_type_id UUID,
  depth INT
)
LANGUAGE sql STABLE
AS $$
  WITH RECURSIVE graph AS (
    SELECT
      kr.id AS relationship_id,
      kr.from_record_id,
      kr.to_record_id,
      kr.relationship_type_id,
      1 AS depth
    FROM public.knowledge_relationships kr
    WHERE kr.from_record_id = root_record_id OR kr.to_record_id = root_record_id

    UNION ALL

    SELECT
      kr.id,
      kr.from_record_id,
      kr.to_record_id,
      kr.relationship_type_id,
      g.depth + 1
    FROM public.knowledge_relationships kr
    JOIN graph g ON (
      kr.from_record_id = g.to_record_id OR kr.to_record_id = g.from_record_id
    )
    WHERE g.depth < max_depth
  )
  SELECT DISTINCT * FROM graph;
$$;

-- ---------------------------------------------------------------------------
-- Audit helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_changes JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, changes, created_by)
  VALUES (p_action, p_entity_type, p_entity_id, auth.uid(), p_changes, auth.uid())
  RETURNING id INTO log_id;
  RETURN log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION public.hybrid_search_knowledge TO authenticated;
GRANT EXECUTE ON FUNCTION public.expand_knowledge_graph TO authenticated;
GRANT EXECUTE ON FUNCTION public.write_audit_log TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed: domain vocabulary (ComfyUI first domain — all extensible via DB)
-- ---------------------------------------------------------------------------

INSERT INTO public.source_types (code, label, description) VALUES
  ('wiki', 'Wiki', 'Community or official wiki pages'),
  ('documentation', 'Documentation', 'Official product documentation'),
  ('github', 'GitHub Repository', 'Source code and README knowledge'),
  ('workflow_library', 'Workflow Library', 'Exported ComfyUI workflow collections'),
  ('research_paper', 'Research Paper', 'Academic or technical papers'),
  ('youtube_transcript', 'YouTube Transcript', 'Video tutorial transcripts'),
  ('community', 'Community Discovery', 'Forum posts, Discord insights, etc.');

INSERT INTO public.knowledge_types (code, label, description, schema_definition) VALUES
  ('node', 'Node Knowledge', 'ComfyUI node capabilities and parameters', '{"required":["node_class","category"]}'),
  ('model', 'Model Knowledge', 'Checkpoint, diffusion, or video model facts', '{"required":["model_family"]}'),
  ('workflow', 'Workflow Knowledge', 'Workflow patterns and composition rules', '{"required":["pattern"]}'),
  ('failure', 'Failure Knowledge', 'Known issues linked to generation', '{"required":["symptom"]}'),
  ('performance', 'Performance Knowledge', 'VRAM, speed, and hardware guidance', '{"required":["metric"]}'),
  ('technique', 'Technique Knowledge', 'Methods like ControlNet usage, IPAdapter', '{"required":["technique"]}');

INSERT INTO public.relationship_types (code, label, description, is_directional) VALUES
  ('relates_to', 'Relates To', 'General semantic relationship', true),
  ('works_with', 'Works With', 'Compatible combination', true),
  ('requires', 'Requires', 'Hard dependency', true),
  ('recommends', 'Recommends', 'Soft recommendation', true),
  ('conflicts_with', 'Conflicts With', 'Known incompatibility', true),
  ('implements', 'Implements', 'Realizes a technique or pattern', true),
  ('derived_from', 'Derived From', 'Provenance link', true);

INSERT INTO public.workflow_categories (code, label, description) VALUES
  ('txt2img', 'Text to Image', 'Standard text-to-image pipelines'),
  ('img2img', 'Image to Image', 'Image transformation workflows'),
  ('inpaint', 'Inpainting', 'Region fill and edit workflows'),
  ('controlnet', 'ControlNet', 'Guided generation workflows'),
  ('video', 'Video Generation', 'Image-to-video and text-to-video'),
  ('ipadapter', 'IPAdapter', 'Image prompt adapter workflows'),
  ('lora', 'LoRA', 'LoRA training and inference workflows');

-- Set active status on seeded rows
DO $$
DECLARE
  active_id UUID;
BEGIN
  SELECT public.active_status_id() INTO active_id;
  UPDATE public.source_types SET status = active_id WHERE status IS NULL;
  UPDATE public.knowledge_types SET status = active_id WHERE status IS NULL;
  UPDATE public.relationship_types SET status = active_id WHERE status IS NULL;
  UPDATE public.workflow_categories SET status = active_id WHERE status IS NULL;
END $$;
