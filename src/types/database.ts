export type EntityStatus = {
  id: string;
  domain: string;
  code: string;
  label: string;
};

export type SourceType = {
  id: string;
  code: string;
  label: string;
  description: string | null;
};

export type Source = {
  id: string;
  organization_id: string | null;
  source_type_id: string;
  title: string;
  url: string | null;
  external_id: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  confidence: number | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  source_types?: SourceType;
};

export type KnowledgeType = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  schema_definition: Record<string, unknown>;
};

export type KnowledgeDomain = {
  id: string;
  code: string;
  label: string;
  description: string | null;
};

export type EntityType = {
  id: string;
  code: string;
  label: string;
  description: string | null;
};

export type CanonicalEntity = {
  id: string;
  domain_id: string;
  entity_type_id: string;
  canonical_slug: string;
  display_name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  knowledge_domains?: KnowledgeDomain;
  entity_types?: EntityType;
};

export type EntityAlias = {
  id: string;
  entity_id: string;
  domain_id: string;
  alias: string;
  alias_normalized: string;
  source: string | null;
  confidence: number | null;
};

export type KnowledgeRecord = {
  id: string;
  organization_id: string | null;
  knowledge_type_id: string;
  source_id: string | null;
  domain_id: string | null;
  entity_id: string | null;
  title: string;
  slug: string | null;
  summary: string | null;
  structured_data: Record<string, unknown>;
  confidence: number | null;
  created_at: string;
  updated_at: string;
  knowledge_types?: KnowledgeType;
  entities?: CanonicalEntity | null;
  knowledge_domains?: KnowledgeDomain | null;
};

export type RelationshipType = {
  id: string;
  code: string;
  label: string;
  description: string | null;
};

export type KnowledgeRelationship = {
  id: string;
  from_record_id: string;
  to_record_id: string;
  relationship_type_id: string;
  weight: number | null;
  metadata: Record<string, unknown>;
  evidence: string | null;
  relationship_types?: RelationshipType;
  from_record?: KnowledgeRecord;
  to_record?: KnowledgeRecord;
};

export type Workflow = {
  id: string;
  title: string;
  description: string | null;
  workflow_json: Record<string, unknown>;
  metadata: Record<string, unknown>;
  node_count: number | null;
  category_id: string | null;
  created_at: string;
};

export type FailureRecord = {
  id: string;
  symptom: string;
  causes: unknown[];
  fixes: unknown[];
  reference_links: unknown[];
  created_at: string;
};

export type Recipe = {
  id: string;
  title: string;
  description: string | null;
  goal: string | null;
  knowledge_record_ids: string[];
  created_at: string;
};

export type SearchResult = {
  id: string;
  title: string;
  summary: string | null;
  knowledge_type_id: string;
  text_rank: number;
  semantic_similarity: number;
  combined_score: number;
};

export type GraphNode = {
  id: string;
  label: string;
  type: string;
};

export type GraphLink = {
  source: string;
  target: string;
  type: string;
};
