"use client";

import { useState } from "react";
import { searchKnowledge, semanticSearchAll } from "@/actions/search";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Search } from "lucide-react";
import type { SearchResult } from "@/types/database";

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [globalResults, setGlobalResults] = useState<
    {
      entity_type: string;
      entity_id: string;
      content_text: string;
      similarity: number;
    }[]
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function runSearch() {
    if (!query.trim()) return;
    setPending(true);
    const [knowledge, global] = await Promise.all([
      searchKnowledge(query),
      semanticSearchAll(query),
    ]);
    setResults(knowledge as SearchResult[]);
    setGlobalResults(global.results);
    setMessage(global.message);
    setPending(false);
  }

  return (
    <div className="space-y-8">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search knowledge — e.g. Flux ControlNet OpenPose VRAM"
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          className="max-w-xl"
        />
        <Button onClick={runSearch} disabled={pending}>
          <Search className="mr-2 h-4 w-4" />
          {pending ? "Searching…" : "Search"}
        </Button>
      </div>

      {message && (
        <p className="text-sm text-amber-500/90">{message}</p>
      )}

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
                  href={`/knowledge/${r.id}`}
                  className="font-medium hover:text-primary"
                >
                  {r.title}
                </Link>
                {r.summary && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.summary}
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  <Badge variant="outline">
                    score {(r.combined_score ?? 0).toFixed(2)}
                  </Badge>
                  {r.semantic_similarity > 0 && (
                    <Badge variant="secondary">
                      semantic {(r.semantic_similarity ?? 0).toFixed(2)}
                    </Badge>
                  )}
                </div>
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
                <div className="flex items-center gap-2">
                  <Badge>{r.entity_type}</Badge>
                  <span className="text-muted-foreground">
                    {(r.similarity * 100).toFixed(0)}% match
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-muted-foreground">
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
