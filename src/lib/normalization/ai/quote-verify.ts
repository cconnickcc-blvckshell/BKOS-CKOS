export type SourceQuoteRef = {
  quote: string;
  context?: string;
};

function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Returns true if quote appears verbatim (whitespace-normalized) in source. */
export function quoteSupportedInSource(quote: string, sourceText: string): boolean {
  if (!quote?.trim() || !sourceText?.trim()) return false;
  const q = normalizeForMatch(quote);
  const src = normalizeForMatch(sourceText);
  if (q.length < 8) return src.includes(q);
  return src.includes(q);
}

export function adjustConfidenceForQuotes(
  proposedConfidence: number,
  refs: SourceQuoteRef[],
  sourceText: string
): { confidence: number; notes: string } {
  if (!refs.length) {
    return {
      confidence: Math.min(proposedConfidence, 0.35),
      notes: "No source quotes provided — low confidence.",
    };
  }

  const supported = refs.filter((r) => quoteSupportedInSource(r.quote, sourceText));
  if (supported.length === 0) {
    return {
      confidence: Math.min(proposedConfidence, 0.35),
      notes: "No source_quote_refs matched verbatim text in extraction — flagged low confidence.",
    };
  }

  if (supported.length < refs.length) {
    return {
      confidence: Math.min(proposedConfidence, 0.55),
      notes: `Only ${supported.length}/${refs.length} quotes verified in source.`,
    };
  }

  return { confidence: proposedConfidence, notes: "" };
}
