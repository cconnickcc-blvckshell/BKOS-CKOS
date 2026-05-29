import { createHash } from "crypto";

/** Deterministic SHA-256 hex digest for embeddable content. */
export function hashEmbeddableContent(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Rough token estimate for logging (≈4 chars per token). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
