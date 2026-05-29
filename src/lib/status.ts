import { createClient } from "@/lib/supabase/server";

let cachedActiveStatusId: string | null = null;

export async function getActiveStatusId(): Promise<string> {
  if (cachedActiveStatusId) return cachedActiveStatusId;

  const supabase = await createClient();
  const { data } = await supabase
    .from("status_types")
    .select("id")
    .eq("domain", "entity")
    .eq("code", "active")
    .single();

  if (!data?.id) throw new Error("Active status not configured in database");
  cachedActiveStatusId = data.id;
  return data.id;
}
