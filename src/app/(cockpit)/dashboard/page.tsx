import { getDashboardStats } from "@/actions/dashboard";
import { PageHeader } from "@/components/cockpit/page-header";
import { StatCard } from "@/components/cockpit/stat-card";
import {
  BookOpen,
  Database,
  GitBranch,
  Workflow,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

export default async function DashboardPage() {
  const { counts, recentKnowledge } = await getDashboardStats();

  return (
    <>
      <PageHeader
        title="Mission Control"
        description="CKOS knowledge cockpit — system overview and recent activity"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Sources"
          value={counts.sources}
          icon={Database}
          subtitle="Acquisition pipeline"
        />
        <StatCard
          title="Knowledge records"
          value={counts.knowledge_records}
          icon={BookOpen}
          subtitle="Normalized intelligence"
        />
        <StatCard
          title="Relationships"
          value={counts.knowledge_relationships}
          icon={GitBranch}
          subtitle="Graph connections"
        />
        <StatCard
          title="Workflows"
          value={counts.workflows}
          icon={Workflow}
          subtitle="Ingested ComfyUI JSON"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">System layers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              { label: "Vector embeddings", count: counts.embeddings },
              { label: "Failure records", count: counts.failure_records },
              { label: "Studio recipes", count: counts.recipes },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between border-b border-border/40 pb-2 last:border-0"
              >
                <span className="text-muted-foreground">{row.label}</span>
                <Badge variant="secondary">{row.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent knowledge</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {recentKnowledge.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No records yet.{" "}
                <Link href="/knowledge" className="text-primary hover:underline">
                  Add knowledge
                </Link>
              </p>
            ) : (
              <ul className="space-y-3">
                {recentKnowledge.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/knowledge/${item.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {item.title}
                    </Link>
                    <div className="mt-0.5 flex gap-2 text-xs text-muted-foreground">
                      <span>
                        {(item.knowledge_types as { label?: string })?.label}
                      </span>
                      <span>·</span>
                      <span>
                        {formatDistanceToNow(new Date(item.updated_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
