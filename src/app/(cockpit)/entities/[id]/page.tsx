import { getEntity } from "@/actions/entities";
import { PageHeader } from "@/components/cockpit/page-header";
import { AddAliasForm } from "@/components/entities/add-alias-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { notFound } from "next/navigation";

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  try {
    data = await getEntity(id);
  } catch {
    notFound();
  }

  const { entity, aliases } = data;

  return (
    <>
      <PageHeader
        title={entity.display_name}
        description={entity.description ?? undefined}
        actions={
          <>
            <Badge variant="outline" className="font-mono">
              {entity.canonical_slug}
            </Badge>
            <Badge variant="secondary">
              {(entity.entity_types as { label?: string })?.label}
            </Badge>
            <Badge>
              {(entity.knowledge_domains as { label?: string })?.label}
            </Badge>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Aliases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {aliases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No aliases yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {aliases.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2"
                  >
                    <span>{a.alias}</span>
                    <code className="text-xs text-muted-foreground">
                      {a.alias_normalized}
                    </code>
                  </li>
                ))}
              </ul>
            )}
            <AddAliasForm entityId={id} />
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-md bg-muted/30 p-4 font-mono text-xs">
              {JSON.stringify(entity.metadata, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
