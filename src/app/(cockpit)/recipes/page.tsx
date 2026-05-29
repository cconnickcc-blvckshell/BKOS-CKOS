import { PageHeader } from "@/components/cockpit/page-header";
import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function RecipesPage() {
  const supabase = await createClient();
  const { data: recipes } = await supabase
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        title="Recipe Explorer"
        description="Production-ready studio recipes referencing knowledge records — no duplication"
      />

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Goal</TableHead>
              <TableHead>Linked records</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!recipes?.length ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  No recipes yet. Studio recipes module activates in Phase 2.
                </TableCell>
              </TableRow>
            ) : (
              recipes.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.goal ?? "—"}
                  </TableCell>
                  <TableCell>
                    {r.knowledge_record_ids?.length ?? 0} references
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
