import { runSystemHealthChecks } from "@/actions/health";
import { PageHeader } from "@/components/cockpit/page-header";
import { StatusBadge } from "@/components/observability/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default async function HealthPage() {
  const { checks, latestErrors } = await runSystemHealthChecks();

  return (
    <>
      <PageHeader
        title="System health"
        description="Connectivity, providers, and recent pipeline failures"
      />

      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {checks.map((c) => (
          <Card key={c.checkCode} className="border-border/60">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{c.checkCode}</CardTitle>
                <StatusBadge status={c.status} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{c.message}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Latest system errors
          </h2>
          <Link href="/events" className="text-sm text-primary hover:underline">
            View all events
          </Link>
        </div>
        {latestErrors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent warnings or failures.</p>
        ) : (
          <ul className="space-y-2">
            {latestErrors.map((e) => {
              const err = Array.isArray(e.error_codes)
                ? (e.error_codes[0] as { code: string } | undefined)
                : (e.error_codes as { code: string } | null);
              return (
              <li
                key={e.id}
                className="rounded-lg border border-border/60 px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <StatusBadge status={e.severity as "warning" | "failed"} />
                  {err?.code && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {err.code}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1">{e.message}</p>
                <p className="text-xs text-muted-foreground">
                  {e.entity_type}
                  {e.entity_id ? ` · ${e.entity_id}` : ""}
                </p>
              </li>
            );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
