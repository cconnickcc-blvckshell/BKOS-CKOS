export type CampaignSourceRow = {
  id: string;
  status_id: string;
  curation_campaign_source_statuses: { code: string; label: string } | null;
  source_fetch_job_id: string | null;
  source_extraction_result_id: string | null;
  normalization_job_id: string | null;
};

export type CampaignProgressMetrics = {
  totalSources: number;
  pendingFetch: number;
  fetched: number;
  fetchFailed: number;
  extractionReady: number;
  normalizationPending: number;
  normalizationReady: number;
  approved: number;
  embedded: number;
  skipped: number;
  percentComplete: number;
};

export function computeCampaignMetrics(
  sources: CampaignSourceRow[],
  approvedKnowledgeCount: number,
  embeddedCount: number
): CampaignProgressMetrics {
  const codes = sources.map(
    (s) => s.curation_campaign_source_statuses?.code ?? "pending"
  );

  const count = (c: string) => codes.filter((x) => x === c).length;

  const totalSources = sources.length;
  const pendingFetch = count("pending") + count("fetch_pending");
  const fetched = count("fetched");
  const fetchFailed = count("fetch_failed");
  const extractionReady = count("extraction_ready");
  const normalizationPending = count("normalization_pending");
  const normalizationReady = count("normalization_ready");
  const approved = count("approved");
  const embedded = count("embedded");
  const skipped = count("skipped");

  const pipelineDone = embedded + approved;
  const percentComplete =
    totalSources === 0
      ? 0
      : Math.round(
          ((pipelineDone + normalizationReady * 0.5 + extractionReady * 0.25) /
            totalSources) *
            100
        );

  return {
    totalSources,
    pendingFetch,
    fetched,
    fetchFailed,
    extractionReady,
    normalizationPending,
    normalizationReady,
    approved: Math.max(approved, approvedKnowledgeCount),
    embedded: Math.max(embedded, embeddedCount),
    skipped,
    percentComplete: Math.min(100, percentComplete),
  };
}
