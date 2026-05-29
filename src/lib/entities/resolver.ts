import { createClient } from "@/lib/supabase/server";
export type ResolvedEntity = {
  entity_id: string;
  canonical_slug: string;
  display_name: string;
  entity_type_code: string;
  matched_alias: string;
  match_type: string;
};

/** Resolve alias via database RPC (single source of truth). */
export async function resolveEntityAlias(
  domainCode: string,
  alias: string
): Promise<ResolvedEntity | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_entity_alias", {
    p_domain_code: domainCode,
    p_alias: alias,
  });

  if (error) throw new Error(error.message);
  const row = data?.[0] as ResolvedEntity | undefined;
  return row ?? null;
}
