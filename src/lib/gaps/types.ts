export type GapCandidate = {
  gapTypeCode: string;
  severityCode: string;
  title: string;
  description: string;
  entityId?: string;
  evidence: {
    evidence_type: string;
    linked_entity_type?: string;
    linked_entity_id?: string;
    evidence_summary: string;
  }[];
  metadata?: Record<string, unknown>;
};

export type AnalyzeCampaignResult = {
  detected: number;
  created: number;
  updated: number;
  gapIds: string[];
};
