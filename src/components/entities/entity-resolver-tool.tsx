"use client";

import { useState } from "react";
import { resolveAliasAction } from "@/actions/entities";
import { normalizeEntityAlias } from "@/lib/entities/normalize-alias";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Domain = { code: string; label: string };

export function EntityResolverTool({
  domains,
}: {
  domains: Domain[];
}) {
  const [domainCode, setDomainCode] = useState("comfyui");
  const [alias, setAlias] = useState("");
  const [result, setResult] = useState<{
    canonical_slug: string;
    display_name: string;
    match_type: string;
    matched_alias: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = normalizeEntityAlias(alias);

  async function resolve() {
    setError(null);
    setResult(null);
    const res = await resolveAliasAction(domainCode, alias);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (!res.result) {
      setError("No match");
      return;
    }
    setResult(res.result);
  }

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">Alias resolver</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="resolver-domain">Domain</Label>
            <select
              id="resolver-domain"
              value={domainCode}
              onChange={(e) => setDomainCode(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {domains.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="resolver-alias">Alias text</Label>
            <div className="flex gap-2">
              <Input
                id="resolver-alias"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="Open Pose"
              />
              <Button type="button" onClick={resolve}>
                Resolve
              </Button>
            </div>
          </div>
        </div>
        {preview && (
          <p className="text-xs text-muted-foreground">
            Normalized preview: <code className="font-mono">{preview}</code>
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && (
          <div className="rounded-md border border-border/50 bg-muted/20 p-3 text-sm">
            <p className="font-medium">{result.display_name}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline" className="font-mono">
                {result.canonical_slug}
              </Badge>
              <Badge variant="secondary">{result.match_type}</Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Matched via: {result.matched_alias}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
