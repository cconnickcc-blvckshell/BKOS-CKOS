"use server";

import { createClient } from "@/lib/supabase/server";

export async function getDashboardStats() {
  const supabase = await createClient();

  const tables = [
    "sources",
    "knowledge_records",
    "knowledge_relationships",
    "workflows",
    "failure_records",
    "recipes",
    "embeddings",
  ] as const;

  const counts: Record<string, number> = {};

  await Promise.all(
    tables.map(async (table) => {
      const { count } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });
      counts[table] = count ?? 0;
    })
  );

  const { data: recentKnowledge } = await supabase
    .from("knowledge_records")
    .select("id, title, updated_at, knowledge_types(label)")
    .order("updated_at", { ascending: false })
    .limit(5);

  return { counts, recentKnowledge: recentKnowledge ?? [] };
}
