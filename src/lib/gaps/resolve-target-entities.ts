import { createClient } from "@/lib/supabase/server";

export type ResolvedTargetEntity = {
  id: string;
  canonical_slug: string;
  display_name: string;
};

/** Resolve campaign target_entities JSONB to entity rows. */
export async function resolveCampaignTargetEntities(
  targetEntities: unknown,
  domainId: string
): Promise<ResolvedTargetEntity[]> {
  if (!Array.isArray(targetEntities) || targetEntities.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const resolved: ResolvedTargetEntity[] = [];
  const seen = new Set<string>();

  for (const item of targetEntities) {
    let entityId: string | null = null;
    let slug: string | null = null;

    if (typeof item === "string") {
      slug = item.trim();
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.id === "string") entityId = o.id;
      if (typeof o.slug === "string") slug = o.slug;
      if (typeof o.canonical_slug === "string") slug = o.canonical_slug;
    }

    if (entityId) {
      const { data } = await supabase
        .from("entities")
        .select("id, canonical_slug, display_name")
        .eq("id", entityId)
        .eq("domain_id", domainId)
        .maybeSingle();
      if (data && !seen.has(data.id)) {
        seen.add(data.id);
        resolved.push(data);
      }
      continue;
    }

    if (slug) {
      const { data } = await supabase
        .from("entities")
        .select("id, canonical_slug, display_name")
        .eq("domain_id", domainId)
        .eq("canonical_slug", slug)
        .maybeSingle();
      if (data && !seen.has(data.id)) {
        seen.add(data.id);
        resolved.push(data);
      }
    }
  }

  return resolved;
}
