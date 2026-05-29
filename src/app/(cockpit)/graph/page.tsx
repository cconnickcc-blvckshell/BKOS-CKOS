import { getKnowledgeGraph } from "@/actions/knowledge";
import { PageHeader } from "@/components/cockpit/page-header";
import { KnowledgeGraphView } from "@/components/knowledge/knowledge-graph";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function GraphPage() {
  const { nodes, links } = await getKnowledgeGraph();

  return (
    <>
      <PageHeader
        title="Relationship Graph"
        description="Visualize knowledge connections — ControlNet, Flux, IPAdapter, and beyond"
        actions={
          <Button variant="outline" size="sm" render={<Link href="/knowledge" />}>
            Manage records
          </Button>
        }
      />
      <KnowledgeGraphView nodes={nodes} links={links} />
      <p className="mt-4 text-xs text-muted-foreground">
        {nodes.length} nodes · {links.length} edges — colors reflect knowledge
        type codes from the database
      </p>
    </>
  );
}
