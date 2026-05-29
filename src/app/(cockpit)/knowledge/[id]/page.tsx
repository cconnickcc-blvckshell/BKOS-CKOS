import {
  getKnowledgeRecord,
  getRecordRelationships,
} from "@/actions/knowledge";
import { PageHeader } from "@/components/cockpit/page-header";
import { AssignEntityPanel } from "@/components/entities/assign-entity-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function KnowledgeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let record;
  let relationships;
  try {
    [record, relationships] = await Promise.all([
      getKnowledgeRecord(id),
      getRecordRelationships(id),
    ]);
  } catch {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={record.title}
        description={record.summary ?? undefined}
        actions={
          <Badge variant="secondary">
            {(record.knowledge_types as { label?: string })?.label}
          </Badge>
        }
      />

      <Card className="mb-6 border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Canonical entity</CardTitle>
        </CardHeader>
        <CardContent>
          <AssignEntityPanel
            knowledgeRecordId={id}
            currentEntity={
              record.entities
                ? {
                    id: (record.entities as { id: string }).id,
                    canonical_slug: (record.entities as { canonical_slug: string })
                      .canonical_slug,
                    display_name: (record.entities as { display_name: string })
                      .display_name,
                  }
                : null
            }
            defaultDomainCode={
              (record.knowledge_domains as { code?: string } | null)?.code ??
              "comfyui"
            }
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Structured data</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-md bg-muted/30 p-4 font-mono text-xs">
              {JSON.stringify(record.structured_data, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Relationships</CardTitle>
          </CardHeader>
          <CardContent>
            {relationships.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No links yet. Use &quot;Link records&quot; from the explorer.
              </p>
            ) : (
              <ul className="space-y-3 text-sm">
                {relationships.map((rel) => {
                  const isFrom = rel.from_record_id === id;
                  const other = isFrom
                    ? (rel.to_record as { id: string; title: string })
                    : (rel.from_record as { id: string; title: string });
                  return (
                    <li
                      key={rel.id}
                      className="rounded-md border border-border/50 p-3"
                    >
                      <span className="text-muted-foreground">
                        {(rel.relationship_types as { label?: string })?.label}
                      </span>
                      <div className="mt-1">
                        <Link
                          href={`/knowledge/${other?.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {other?.title}
                        </Link>
                      </div>
                      {rel.evidence && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {rel.evidence}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
