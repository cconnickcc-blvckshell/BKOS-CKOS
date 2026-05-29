import { createClient } from "@/lib/supabase/server";

export async function writeAudit(
  action: string,
  entityType: string,
  entityId: string,
  changes: Record<string, unknown> = {}
) {
  const supabase = await createClient();
  await supabase.rpc("write_audit_log", {
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_changes: changes,
  });
}
