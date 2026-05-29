/**
 * Client-side alias normalization — must match public.normalize_entity_alias() in Postgres.
 * Used for UI preview and offline validation scripts.
 */
export function normalizeEntityAlias(raw: string): string | null {
  const underscored = raw.replace(/_/g, " ");
  const collapsed = underscored.replace(/\s+/g, " ").trim();
  const stripped = collapsed.replace(/[^a-zA-Z0-9 ]/g, "");
  const normalized = stripped.toLowerCase().trim();
  return normalized.length > 0 ? normalized : null;
}
