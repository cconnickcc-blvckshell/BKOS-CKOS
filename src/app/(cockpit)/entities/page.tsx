import {
  listEntities,
  listEntityTypes,
  listKnowledgeDomains,
} from "@/actions/entities";
import { PageHeader } from "@/components/cockpit/page-header";
import { CreateEntityDialog } from "@/components/forms/create-entity-dialog";
import { EntityResolverTool } from "@/components/entities/entity-resolver-tool";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function EntitiesPage() {
  const [entities, domains, entityTypes] = await Promise.all([
    listEntities(),
    listKnowledgeDomains(),
    listEntityTypes(),
  ]);

  return (
    <>
      <PageHeader
        title="Canonical Entities"
        description="Domain-agnostic concept registry — one slug, many aliases, no duplicate knowledge"
        actions={
          <CreateEntityDialog domains={domains} entityTypes={entityTypes} />
        }
      />

      <div className="mb-8">
        <EntityResolverTool domains={domains} />
      </div>

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Display name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No entities yet. Seed data appears after migrations, or create
                  one above.
                </TableCell>
              </TableRow>
            ) : (
              entities.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Link
                      href={`/entities/${e.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {e.display_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {e.canonical_slug}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(e.knowledge_domains as { label?: string })?.label ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {(e.entity_types as { label?: string })?.label}
                    </Badge>
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
