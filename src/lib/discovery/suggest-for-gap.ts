import { createClient } from "@/lib/supabase/server";
import { getActiveStatusId } from "@/lib/status";
import { normalizeSourceUrl } from "@/lib/acquisition/normalize-url";
import { matchTrustedDomain, type TrustedDomainRow } from "@/lib/acquisition/trusted-domains";
import { getDiscoveryStatusId, getDiscoverySuggestionSourceId } from "@/lib/discovery/discovery-lookup";

export type SuggestionDraft = {
  suggested_url: string;
  normalized_url: string;
  title: string;
  reason: string;
  confidence_score: number;
  trusted_domain_id: string;
  suggestion_source_code: string;
  metadata?: Record<string, unknown>;
};

function joinOne<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}

function keywordsFromGap(gap: {
  title: string;
  description: string | null;
  gap_types: { code: string };
  entities: { canonical_slug: string; display_name: string } | null;
}): string[] {
  const words = [
    gap.title,
    gap.description ?? "",
    gap.entities?.canonical_slug ?? "",
    gap.entities?.display_name ?? "",
    gap.gap_types.code.replace(/_/g, " "),
  ]
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);

  return [...new Set(words)].slice(0, 12);
}

function linkMatchesKeywords(href: string, text: string, keywords: string[]): boolean {
  const blob = `${href} ${text}`.toLowerCase();
  return keywords.some((k) => blob.includes(k));
}

function buildSearchTargetUrl(trusted: TrustedDomainRow, query: string): string | null {
  const q = encodeURIComponent(query.trim().slice(0, 120));
  if (!q) return null;

  const domain = trusted.domain.toLowerCase();
  if (domain === "comfyui-wiki.com") {
    return `https://comfyui-wiki.com/en/search?query=${q}`;
  }
  if (domain === "docs.comfy.org") {
    return `https://docs.comfy.org/search?q=${q}`;
  }
  if (domain === "github.com") {
    return `https://github.com/search?q=${q}+comfyui&type=repositories`;
  }
  if (domain === "huggingface.co") {
    return `https://huggingface.co/models?search=${q}`;
  }
  return `https://${domain}/search?q=${q}`;
}

export async function buildSuggestionsForGap(gapId: string): Promise<SuggestionDraft[]> {
  const supabase = await createClient();

  const { data: gap, error } = await supabase
    .from("knowledge_gaps")
    .select(
      `*,
      gap_types(id, code, label),
      entities(id, canonical_slug, display_name),
      curation_campaigns(id, title)`
    )
    .eq("id", gapId)
    .single();

  if (error || !gap) throw new Error("Gap not found");

  const gapType = joinOne<{ code: string; label: string }>(gap.gap_types);
  if (!gapType) throw new Error("Gap type missing");

  const entity = joinOne<{ id: string; canonical_slug: string; display_name: string }>(
    gap.entities
  );

  const { data: trustedRows } = await supabase
    .from("trusted_source_domains")
    .select("id, domain, label, is_active, allow_subdomains")
    .eq("is_active", true);

  const trusted = trustedRows ?? [];
  const keywords = keywordsFromGap({
    title: gap.title,
    description: gap.description,
    gap_types: gapType,
    entities: entity,
  });

  const drafts: SuggestionDraft[] = [];
  const seenUrls = new Set<string>();

  function pushDraft(d: SuggestionDraft) {
    if (seenUrls.has(d.normalized_url)) return;
    seenUrls.add(d.normalized_url);
    drafts.push(d);
  }

  const campaignId = gap.campaign_id as string | null;

  if (campaignId) {
    const { data: campaignSources } = await supabase
      .from("curation_campaign_sources")
      .select(
        `source_id, sources(id, url, title),
         source_extraction_results(id, links, canonical_url)`
      )
      .eq("campaign_id", campaignId);

    for (const cs of campaignSources ?? []) {
      const extraction = joinOne<{ id: string; links: { href: string; text?: string }[] }>(
        cs.source_extraction_results
      );
      const source = joinOne<{ id: string; url: string | null; title: string }>(cs.sources);

      if (gapType.code === "stale_source" && source?.url) {
        try {
          const normalized = normalizeSourceUrl(source.url);
          const match = matchTrustedDomain(new URL(normalized).hostname, trusted);
          if (match) {
            pushDraft({
              suggested_url: source.url,
              normalized_url: normalized,
              title: `Refetch: ${source.title}`,
              reason:
                "Stale source gap — suggest re-fetching this trusted URL after review (no automatic fetch).",
              confidence_score: 0.75,
              trusted_domain_id: match.id,
              suggestion_source_code: "known_trusted_domain",
              metadata: { source_id: source.id, action: "refetch_review" },
            });
          }
        } catch {
          /* skip invalid url */
        }
      }

      const links = extraction?.links ?? [];
      for (const link of links) {
        if (!link.href?.startsWith("http")) continue;
        let normalized: string;
        try {
          normalized = normalizeSourceUrl(link.href);
        } catch {
          continue;
        }
        const host = new URL(normalized).hostname;
        const match = matchTrustedDomain(host, trusted);
        if (!match) continue;

        const relevant =
          gapType.code === "missing_citations"
            ? true
            : linkMatchesKeywords(link.href, link.text ?? "", keywords);

        if (!relevant && gapType.code !== "related_source_links") continue;

        if (
          gapType.code === "missing_workflow" &&
          !/workflow|node|comfy|graph/i.test(`${link.href} ${link.text}`)
        ) {
          continue;
        }
        if (
          gapType.code === "missing_failure_modes" &&
          !/fail|error|troubleshoot|debug/i.test(`${link.href} ${link.text}`)
        ) {
          continue;
        }
        if (
          gapType.code === "missing_recipe" &&
          !/recipe|tutorial|guide|how/i.test(`${link.href} ${link.text}`)
        ) {
          continue;
        }

        pushDraft({
          suggested_url: link.href,
          normalized_url: normalized,
          title: link.text?.slice(0, 200) || normalized,
          reason: `Related link from campaign extraction (gap: ${gapType.label}).`,
          confidence_score: 0.7,
          trusted_domain_id: match.id,
          suggestion_source_code: "related_source_links",
          metadata: { extraction_id: extraction?.id },
        });
      }
    }
  }

  const queryTemplates: Record<string, string> = {
    missing_workflow: "comfyui workflow",
    missing_failure_modes: "comfyui failure troubleshooting",
    missing_recipe: "comfyui recipe tutorial",
    missing_entity: entity?.display_name ?? "comfyui",
    weak_confidence: entity?.display_name ?? "comfyui documentation",
    missing_recipe_card: "comfyui recipe",
  };

  const searchBase =
    queryTemplates[gapType.code] ??
    `${entity?.display_name ?? "comfyui"} ${gapType.label}`;

  for (const row of trusted) {
    const searchUrl = buildSearchTargetUrl(row, searchBase);
    if (!searchUrl) continue;

    let normalized: string;
    try {
      normalized = normalizeSourceUrl(searchUrl);
    } catch {
      continue;
    }

    const isCitationReview = gapType.code === "missing_citations";
    pushDraft({
      suggested_url: searchUrl,
      normalized_url: normalized,
      title: `${row.label} search: ${searchBase}`,
      reason: isCitationReview
        ? "Citation gap — use search to find corroborating trusted pages for manual review (not auto-fetch)."
        : `Trusted-domain search target for gap type "${gapType.label}". Review results manually.`,
      confidence_score: isCitationReview ? 0.45 : 0.55,
      trusted_domain_id: row.id,
      suggestion_source_code: "search_query",
      metadata: { search_query: searchBase, manual_review: true },
    });
  }

  const { data: existingSources } = await supabase
    .from("sources")
    .select("id, title, url")
    .eq("domain_id", gap.domain_id)
    .not("url", "is", null)
    .limit(30);

  for (const src of existingSources ?? []) {
    if (!src.url) continue;
    let normalized: string;
    try {
      normalized = normalizeSourceUrl(src.url);
    } catch {
      continue;
    }
    const match = matchTrustedDomain(new URL(normalized).hostname, trusted);
    if (!match) continue;
    if (!linkMatchesKeywords(src.url, src.title, keywords) && gapType.code !== "weak_confidence") {
      continue;
    }

    pushDraft({
      suggested_url: src.url,
      normalized_url: normalized,
      title: src.title,
      reason: `Existing CKOS source on trusted domain may address "${gapType.label}".`,
      confidence_score: 0.65,
      trusted_domain_id: match.id,
      suggestion_source_code: "known_trusted_domain",
      metadata: { source_id: src.id },
    });
  }

  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, title, objective")
    .eq("domain_id", gap.domain_id)
    .limit(5);

  if (gapType.code === "missing_recipe" && recipes?.length) {
    for (const r of recipes) {
      pushDraft({
        suggested_url: `https://comfyui-wiki.com/en/search?query=${encodeURIComponent(r.title)}`,
        normalized_url: `https://comfyui-wiki.com/en/search?query=${encodeURIComponent(r.title)}`,
        title: `Review recipe: ${r.title}`,
        reason: `Existing recipe in CKOS may inform a new source — find supporting docs on trusted wiki.`,
        confidence_score: 0.6,
        trusted_domain_id:
          trusted.find((t) => t.domain === "comfyui-wiki.com")?.id ?? trusted[0]!.id,
        suggestion_source_code: "campaign_gap_analysis",
        metadata: { recipe_id: r.id },
      });
    }
  }

  return drafts.slice(0, 15);
}

export async function persistSuggestionsForGap(
  gapId: string,
  userId: string,
  drafts: SuggestionDraft[]
): Promise<{ created: number; updated: number; suggestionIds: string[] }> {
  const supabase = await createClient();
  const entityStatusId = await getActiveStatusId();
  const proposedId = await getDiscoveryStatusId("proposed");

  const { data: gap } = await supabase
    .from("knowledge_gaps")
    .select("domain_id, campaign_id")
    .eq("id", gapId)
    .single();

  if (!gap) throw new Error("Gap not found");

  let created = 0;
  let updated = 0;
  const suggestionIds: string[] = [];

  for (const d of drafts) {
    const sourceId = await getDiscoverySuggestionSourceId(d.suggestion_source_code);

    const { data: existing } = await supabase
      .from("source_discovery_suggestions")
      .select("id, status_id")
      .eq("normalized_url", d.normalized_url)
      .eq("knowledge_gap_id", gapId)
      .maybeSingle();

    if (existing?.id) {
      const { data: st } = await supabase
        .from("discovery_statuses")
        .select("code")
        .eq("id", existing.status_id)
        .single();
      if (st?.code === "added_to_campaign" || st?.code === "dismissed") {
        suggestionIds.push(existing.id);
        continue;
      }

      await supabase
        .from("source_discovery_suggestions")
        .update({
          title: d.title,
          reason: d.reason,
          confidence_score: d.confidence_score,
          metadata: { ...d.metadata, last_suggested_at: new Date().toISOString() },
        })
        .eq("id", existing.id);

      updated++;
      suggestionIds.push(existing.id);
      continue;
    }

    const { data: row, error } = await supabase
      .from("source_discovery_suggestions")
      .insert({
        domain_id: gap.domain_id,
        knowledge_gap_id: gapId,
        campaign_id: gap.campaign_id,
        suggested_url: d.suggested_url,
        normalized_url: d.normalized_url,
        title: d.title,
        reason: d.reason,
        confidence_score: d.confidence_score,
        trusted_domain_id: d.trusted_domain_id,
        suggestion_source_id: sourceId,
        status_id: proposedId,
        metadata: d.metadata ?? {},
        created_by: userId,
        status: entityStatusId,
      })
      .select("id")
      .single();

    if (error || !row) continue;

    await supabase.from("gap_discovery_links").upsert(
      {
        knowledge_gap_id: gapId,
        source_discovery_suggestion_id: row.id,
        created_by: userId,
      },
      { onConflict: "knowledge_gap_id,source_discovery_suggestion_id" }
    );

    created++;
    suggestionIds.push(row.id);
  }

  return { created, updated, suggestionIds };
}
