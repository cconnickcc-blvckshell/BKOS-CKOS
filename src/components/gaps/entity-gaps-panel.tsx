import { listKnowledgeGapsForEntity } from "@/actions/gaps";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export async function EntityGapsPanel({ entityId }: { entityId: string }) {
  const gaps = await listKnowledgeGapsForEntity(entityId);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Knowledge gaps ({gaps.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {gaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No gaps linked to this entity.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {gaps.map((g) => (
              <li key={g.id}>
                <Link href={`/gaps/${g.id}`} className="font-medium hover:text-primary">
                  {g.title}
                </Link>
                <span className="ml-2 text-muted-foreground">
                  {(g.gap_statuses as { label: string })?.label}
                </span>
                <Badge variant="outline" className="ml-2">
                  {(g.gap_severity_levels as { label: string })?.label}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
