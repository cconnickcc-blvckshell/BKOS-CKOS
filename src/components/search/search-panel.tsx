"use client";

import { useState } from "react";
import { searchKnowledge, semanticSearchAll } from "@/actions/search";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Search } from "lucide-react";
import type { EnrichedSearchHit } from "@/lib/embeddings/enrich-search";

type KnowledgeHit = {
  id: string;
  title: string;
  summary: string | null;
  combined_score?: number;
  semantic_similarity?: number;
  match_reason?: string;
  domain_label?: string | null;
  entity_type_label?: string | null;
  source_type_label?: string | null;
  citation?: string | null;
  source_version_number?: number | null;
  entity_name?: string | null;
  href?: string;
};

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KnowledgeHit[]>([]);
  const [globalResults, setGlobalResults] = useState<EnrichedSearchHit[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function runSearch() {
    if (!query.trim()) return;
    setPending(true);
    const [knowledge, global] = await Promise.all([
      searchKnowledge(query),
      semanticSearchAll(query),
    ]);
    setResults(knowledge as KnowledgeHit[]);
    setGlobalResults(global.enriched ?? []);
    setMessage(global.message);
    setPending(false);
  }

  return (
    <div className="space-y-8">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search knowledge — e.g. Flux Kontext ControlNet VRAM"
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          className="max-w-xl"
        />
        <Button onClick={runSearch} disabled={pending}>
          <Search className="mr-2 h-4 w-4" />
          {pending ? "Searching…" : "Search"}
        </Button>
      </div>

      {message && <p className="text-sm text-amber-500/90">{message}</p>}

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Knowledge (hybrid)
        </h2>
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No results yet.</p>
        ) : (
          <ul className="space-y-3">
            {results.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-border/60 p-4"
              >
                <Link
                  href={r.href ?? `/knowledge/${r.id}`}
                  className="font-medium hover:text-primary"
                >
                  {r.title}
                </Link>
                {r.summary && (
                  <p className="mt-1 text-sm text-muted-foreground">{r.summary}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.entity_type_label && (
                    <Badge variant="outline">{r.entity_type_label}</Badge>
                  )}
                  {r.domain_label && (
                    <Badge variant="secondary">{r.domain_label}</Badge>
                  )}
                  {r.source_type_label && (
                    <Badge variant="outline">{r.source_type_label}</Badge>
                  )}
                  {r.citation && (
                    <Badge variant="outline" className="font-normal">
                      {r.citation}
                    </Badge>
                  )}
                  {r.entity_name && (
                    <Badge variant="outline">{r.entity_name}</Badge>
                  )}
                  <Badge variant="outline">
                    score {(r.combined_score ?? 0).toFixed(2)}
                  </Badge>
                </div>
                {r.match_reason && (
                  <p className="mt-2 text-xs text-muted-foreground">{r.match_reason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          All entities (semantic)
        </h2>
        {globalResults.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Cross-entity semantic matches appear here when embeddings exist.
          </p>
        ) : (
          <ul className="space-y-2">
            {globalResults.map((r) => (
              <li
                key={`${r.entity_type}-${r.entity_id}`}
                className="rounded-md border border-border/50 px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={r.href} className="font-medium hover:text-primary">
                    {r.title}
                  </Link>
                  <Badge>{r.entity_type.replace(/_/g, " ")}</Badge>
                  {r.domain_label && (
                    <Badge variant="secondary">{r.domain_label}</Badge>
                  )}
                  {r.entity_type_label && (
                    <Badge variant="outline">{r.entity_type_label}</Badge>
                  )}
                  <span className="text-muted-foreground">
                    {(r.similarity * 100).toFixed(0)}% match
                  </span>
                </div>
                {r.subtitle && (
                  <p className="mt-1 text-muted-foreground">{r.subtitle}</p>
                )}
                {r.citation && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Citation: {r.citation}
                    {r.source_version_number != null
                      ? ` (v${r.source_version_number})`
                      : ""}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{r.match_reason}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {r.content_text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
