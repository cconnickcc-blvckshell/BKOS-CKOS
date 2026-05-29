import { listCurationCampaigns } from "@/actions/curation";
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

export default async function CurationCampaignsPage() {
  const campaigns = await listCurationCampaigns();

  return (
    <>
      <PageHeader
        title="Curation Campaigns"
        description="Targeted research campaigns: trusted URLs → fetch → normalization → reviewed knowledge → embeddings"
        actions={
          <Button size="sm" render={<Link href="/curation/new" />}>
            New campaign
          </Button>
        }
      />

      <p className="mb-6 text-sm text-muted-foreground">
        Controlled campaign management only — no blind crawling or autonomous approval.
      </p>

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No campaigns yet. Create one to start curating trusted sources.
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/curation/${c.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {c.title}
                    </Link>
                    {c.objective && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {c.objective}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {(c.knowledge_domains as { label: string })?.label}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {(c.curation_campaign_statuses as { label: string })?.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(c.updated_at).toLocaleString()}
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
