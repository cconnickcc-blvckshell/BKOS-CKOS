import { listSystemEvents } from "@/actions/events";
import { PageHeader } from "@/components/cockpit/page-header";
import { StatusBadge } from "@/components/observability/status-badge";

function one<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; entity?: string }>;
}) {
  const params = await searchParams;
  const events = await listSystemEvents({
    severity: params.severity,
    entityType: params.entity,
    limit: 100,
  });

  return (
    <>
      <PageHeader
        title="System events"
        description="Pipeline audit trail with structured error codes"
      />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <a href="/events" className="text-primary hover:underline">
          All
        </a>
        <a href="/events?severity=failed" className="text-primary hover:underline">
          Failed
        </a>
        <a href="/events?severity=warning" className="text-primary hover:underline">
          Warning
        </a>
        <a href="/events?severity=success" className="text-primary hover:underline">
          Success
        </a>
        <a
          href="/events?entity=source_fetch_job"
          className="text-primary hover:underline"
        >
          Fetch jobs
        </a>
        <a
          href="/events?entity=embedding_job"
          className="text-primary hover:underline"
        >
          Embeddings
        </a>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => {
            const eventType = one<{ label: string }>(e.system_event_types);
            const errorCode = one<{ code: string }>(e.error_codes);
            return (
              <li
                key={e.id}
                className="rounded-lg border border-border/60 px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={e.severity as "success" | "warning" | "failed"} />
                  <span className="text-xs text-muted-foreground">
                    {eventType?.label}
                  </span>
                  {errorCode?.code && (
                    <span className="font-mono text-xs">{errorCode.code}</span>
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
    </>
  );
}
