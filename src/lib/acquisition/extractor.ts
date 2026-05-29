import * as cheerio from "cheerio";

export type ExtractedHeading = { level: number; text: string };
export type ExtractedLink = { href: string; text: string };
export type ExtractedCodeBlock = { language: string | null; code: string };
export type ExtractedImage = {
  src: string;
  alt: string | null;
  width: string | null;
  height: string | null;
};

export type ExtractionResult = {
  title: string | null;
  canonical_url: string | null;
  summary: string | null;
  headings: ExtractedHeading[];
  links: ExtractedLink[];
  code_blocks: ExtractedCodeBlock[];
  images: ExtractedImage[];
  extracted_markdown: string;
  extracted_text: string;
  extraction_metadata: Record<string, unknown>;
};

export function extractFromHtml(
  html: string,
  pageUrl: string
): ExtractionResult {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe").remove();

  const title =
    $("meta[property='og:title']").attr("content")?.trim() ||
    $("title").first().text().trim() ||
    null;

  const canonical =
    $("link[rel='canonical']").attr("href")?.trim() ||
    $("meta[property='og:url']").attr("content")?.trim() ||
    null;

  let canonical_url: string | null = null;
  if (canonical) {
    try {
      canonical_url = new URL(canonical, pageUrl).toString();
    } catch {
      canonical_url = canonical;
    }
  }

  const headings: ExtractedHeading[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const tag = $(el).prop("tagName")?.toLowerCase() ?? "h2";
    const level = Number(tag.replace("h", "")) || 2;
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text) headings.push({ level, text });
  });

  const links: ExtractedLink[] = [];
  $("a[href]").each((_, el) => {
    const hrefRaw = $(el).attr("href")?.trim();
    if (!hrefRaw || hrefRaw.startsWith("#") || hrefRaw.startsWith("javascript:")) return;
    try {
      const href = new URL(hrefRaw, pageUrl).toString();
      const text = $(el).text().replace(/\s+/g, " ").trim() || href;
      if (links.length < 500) links.push({ href, text });
    } catch {
      /* skip invalid */
    }
  });

  const code_blocks: ExtractedCodeBlock[] = [];
  $("pre").each((_, el) => {
    const codeEl = $(el).find("code").first();
    const code = (codeEl.length ? codeEl : $(el)).text();
    const trimmed = code.replace(/\n$/, "");
    if (!trimmed.trim()) return;
    const cls = codeEl.attr("class") ?? "";
    const langMatch = cls.match(/language-(\w+)/);
    code_blocks.push({
      language: langMatch?.[1] ?? null,
      code: trimmed.slice(0, 50000),
    });
  });

  const images: ExtractedImage[] = [];
  $("img[src]").each((_, el) => {
    const srcRaw = $(el).attr("src")?.trim();
    if (!srcRaw) return;
    try {
      const src = new URL(srcRaw, pageUrl).toString();
      images.push({
        src,
        alt: $(el).attr("alt") ?? null,
        width: $(el).attr("width") ?? null,
        height: $(el).attr("height") ?? null,
      });
    } catch {
      /* skip */
    }
  });

  const main =
    $("article").first().length > 0
      ? $("article").first()
      : $("main").first().length > 0
        ? $("main").first()
        : $("[role='main']").first().length > 0
          ? $("[role='main']").first()
          : $("body");

  const extracted_text = main.text().replace(/\s+/g, " ").trim().slice(0, 500000);
  const summary =
    $("meta[name='description']").attr("content")?.trim() ||
    $("meta[property='og:description']").attr("content")?.trim() ||
    extracted_text.slice(0, 400) ||
    null;

  const extracted_markdown = htmlToSimpleMarkdown($, main, pageUrl);

  return {
    title,
    canonical_url,
    summary,
    headings,
    links: links.slice(0, 500),
    code_blocks: code_blocks.slice(0, 100),
    images: images.slice(0, 200),
    extracted_markdown,
    extracted_text,
    extraction_metadata: {
      extractor: "ckos-html-v1",
      heading_count: headings.length,
      link_count: links.length,
      code_block_count: code_blocks.length,
      image_count: images.length,
      page_url: pageUrl,
    },
  };
}

export function extractFromPlainText(text: string, pageUrl: string): ExtractionResult {
  const lines = text.split(/\r?\n/);
  const title = lines.find((l) => l.trim())?.trim() ?? null;
  return {
    title,
    canonical_url: pageUrl,
    summary: text.slice(0, 400) || null,
    headings: [],
    links: [],
    code_blocks: [],
    images: [],
    extracted_markdown: text.slice(0, 500000),
    extracted_text: text.slice(0, 500000),
    extraction_metadata: {
      extractor: "ckos-plain-v1",
      page_url: pageUrl,
    },
  };
}

function htmlToSimpleMarkdown(
  $: cheerio.CheerioAPI,
  root: ReturnType<cheerio.CheerioAPI>,
  pageUrl: string
): string {
  const parts: string[] = [];

  function walk(el: unknown) {
    const $el = $(el as Parameters<typeof $>[0]);
    const tag = $el.prop("tagName")?.toLowerCase();
    if (!tag) return;

    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
      const level = Number(tag.replace("h", "")) || 1;
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (text) parts.push(`${"#".repeat(level)} ${text}\n`);
      return;
    }
    if (tag === "p") {
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (text) parts.push(`${text}\n\n`);
      return;
    }
    if (tag === "pre") {
      const code = $el.text().replace(/\n$/, "");
      if (code.trim()) parts.push("```\n" + code + "\n```\n\n");
      return;
    }
    if (tag === "a") {
      const href = $el.attr("href");
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (href && text) {
        try {
          const abs = new URL(href, pageUrl).toString();
          parts.push(`[${text}](${abs})`);
        } catch {
          parts.push(text);
        }
      }
      return;
    }
    if (tag === "li") {
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (text) parts.push(`- ${text}\n`);
      return;
    }

    $el.children().each((_, child) => walk(child));
  }

  root.each((_, el) => walk(el));
  return parts.join("").trim().slice(0, 500000);
}
