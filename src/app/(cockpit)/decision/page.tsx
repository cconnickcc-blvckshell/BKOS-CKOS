import { PageHeader } from "@/components/cockpit/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Brain } from "lucide-react";

export default function DecisionPage() {
  return (
    <>
      <PageHeader
        title="Decision Engine"
        description="Goal + constraints → recommended models, workflows, nodes, and warnings"
      />
      <Card className="border-dashed border-border/60">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Brain className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground max-w-md">
            The decision engine requires accumulated knowledge graph density and
            constraint modeling. Scheduled for Phase 2 after foundation
            validation.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
