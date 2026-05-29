import {
  listDecisionConstraintTypes,
  listDecisionGoalTypes,
  listHardwareTiers,
  listKnowledgeDomains,
} from "@/actions/decision";
import { PageHeader } from "@/components/cockpit/page-header";
import { CreateDecisionRequestForm } from "@/components/decision/create-decision-request-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewDecisionRequestPage() {
  const [goalTypes, constraintTypes, domains, hardwareTiers] = await Promise.all([
    listDecisionGoalTypes(),
    listDecisionConstraintTypes(),
    listKnowledgeDomains(),
    listHardwareTiers(),
  ]);

  return (
    <>
      <PageHeader
        title="New decision request"
        description="Describe your goal and constraints — CKOS builds a cited recommendation from existing records"
      />

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Request details</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateDecisionRequestForm
            goalTypes={goalTypes.map((g) => ({ code: g.code, label: g.label }))}
            constraintTypes={constraintTypes.map((c) => ({
              code: c.code,
              label: c.label,
            }))}
            domains={domains.map((d) => ({ code: d.code, label: d.label }))}
            hardwareTiers={hardwareTiers.map((t) => ({
              code: t.code,
              label: t.label,
            }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
