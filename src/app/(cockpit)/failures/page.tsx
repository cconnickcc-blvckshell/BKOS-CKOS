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

export default async function FailuresPage() {
  const supabase = await createClient();
  const { data: failures } = await supabase
    .from("failure_records")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        title="Failure Explorer"
        description="Known symptoms, causes, probabilities, and fixes — structured failure intelligence"
      />

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symptom</TableHead>
              <TableHead>Fixes</TableHead>
              <TableHead>Causes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!failures?.length ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  No failure records yet. Schema ready for Phase 2 ingestion.
                </TableCell>
              </TableRow>
            ) : (
              failures.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.symptom}</TableCell>
                  <TableCell>
                    {Array.isArray(f.fixes) ? f.fixes.length : 0} documented
                  </TableCell>
                  <TableCell>
                    {Array.isArray(f.causes) ? f.causes.length : 0} causes
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
