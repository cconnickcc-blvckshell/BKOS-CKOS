export type NormalizationCitation = {
  source_id: string;
  source_version_id: string;
  source_extraction_result_id: string;
  source_title?: string;
  canonical_url?: string | null;
  version_number?: number;
  extracted_at?: string;
};

export function buildCitations(input: {
  source_id: string;
  source_version_id: string;
  source_extraction_result_id: string;
  source_title?: string;
  canonical_url?: string | null;
  version_number?: number;
  captured_at?: string;
}): NormalizationCitation[] {
  return [
    {
      source_id: input.source_id,
      source_version_id: input.source_version_id,
      source_extraction_result_id: input.source_extraction_result_id,
      source_title: input.source_title,
      canonical_url: input.canonical_url,
      version_number: input.version_number,
      extracted_at: input.captured_at,
    },
  ];
}
