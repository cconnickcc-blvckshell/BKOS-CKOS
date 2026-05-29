import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Extraction = {
  id: string;
  title: string | null;
  canonical_url: string | null;
  summary: string | null;
  headings: unknown;
  links: unknown;
  code_blocks: unknown;
  images: unknown;
  extracted_markdown: string | null;
  extracted_text: string | null;
  extraction_metadata: Record<string, unknown>;
  acquisition_statuses?: { code: string; label: string } | null;
};

export function ExtractionReviewPanel({ extraction }: { extraction: Extraction }) {
  const headings = (extraction.headings ?? []) as { level: number; text: string }[];
  const links = (extraction.links ?? []) as { href: string; text: string }[];
  const codeBlocks = (extraction.code_blocks ?? []) as { language: string | null; code: string }[];
  const images = (extraction.images ?? []) as { src: string; alt: string | null }[];

  return (
    <div className="space-y-4">
      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Extracted content</CardTitle>
          {extraction.acquisition_statuses && (
            <Badge variant="secondary">{extraction.acquisition_statuses.label}</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {extraction.title && (
            <p>
              <span className="font-medium">Title:</span> {extraction.title}
            </p>
          )}
          {extraction.canonical_url && (
            <p className="break-all text-muted-foreground">
              <span className="font-medium text-foreground">Canonical:</span>{" "}
              {extraction.canonical_url}
            </p>
          )}
          {extraction.summary && (
            <p className="text-muted-foreground">{extraction.summary}</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Readable markdown</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs">
            {extraction.extracted_markdown?.slice(0, 50000) ?? "(empty)"}
          </pre>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Plain text</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs text-muted-foreground">
            {extraction.extracted_text?.slice(0, 10000) ?? "(empty)"}
          </pre>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Headings ({headings.length})</CardTitle>
          </CardHeader>
          <CardContent className="max-h-48 overflow-auto text-sm">
            {headings.length === 0 ? (
              <p className="text-muted-foreground">None</p>
            ) : (
              <ul className="space-y-1">
                {headings.slice(0, 40).map((h, i) => (
                  <li key={i} style={{ paddingLeft: (h.level - 1) * 8 }}>
                    H{h.level}: {h.text}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Links ({links.length})</CardTitle>
          </CardHeader>
          <CardContent className="max-h-48 overflow-auto text-xs">
            {links.slice(0, 20).map((l, i) => (
              <p key={i} className="mb-1 truncate">
                <a href={l.href} className="text-primary hover:underline" target="_blank" rel="noreferrer">
                  {l.text}
                </a>
              </p>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">
              Code ({codeBlocks.length}) · Images ({images.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-48 overflow-auto text-xs text-muted-foreground">
            {codeBlocks.slice(0, 3).map((b, i) => (
              <pre key={i} className="mb-2 rounded border p-2">
                {b.code.slice(0, 300)}
              </pre>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
