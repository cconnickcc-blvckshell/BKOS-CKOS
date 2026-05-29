import { listRecipes } from "@/actions/recipes";
import { PageHeader } from "@/components/cockpit/page-header";
import { Button } from "@/components/ui/button";
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

export default async function RecipesPage() {
  const recipes = await listRecipes();

  return (
    <>
      <PageHeader
        title="Recipe Explorer"
        description="Domain-aware studio recipes with inheritance — parent definitions flow to variants without duplication"
        actions={
          <Button size="sm" render={<Link href="/recipes/new" />}>
            New recipe
          </Button>
        }
      />

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Variant</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Domain</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No recipes yet. Run migrations for seed data or create one.
                </TableCell>
              </TableRow>
            ) : (
              recipes.map((r) => {
                const parent = r.parent as { title?: string; recipe_slug?: string } | null;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`/recipes/${r.id}`}
                        className="font-medium hover:text-primary"
                      >
                        {r.title}
                      </Link>
                      {r.recipe_slug && (
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {r.recipe_slug}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {(r.recipe_categories as { label?: string })?.label ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {(r.recipe_variant_types as { label?: string })?.label ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {parent?.title ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(r.knowledge_domains as { label?: string })?.label ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
