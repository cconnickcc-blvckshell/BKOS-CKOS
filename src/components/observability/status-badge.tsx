import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ObservabilityStatus =
  | "success"
  | "warning"
  | "failed"
  | "skipped"
  | "retryable";

const styles: Record<ObservabilityStatus, string> = {
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-400",
  failed: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
  skipped: "border-muted-foreground/30 bg-muted text-muted-foreground",
  retryable: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: ObservabilityStatus;
  label?: string;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(styles[status], className)}>
      {label ?? status}
    </Badge>
  );
}
