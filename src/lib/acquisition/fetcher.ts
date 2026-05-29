import { isAllowedByRobotsTxt } from "@/lib/acquisition/robots";

export type CrawlPolicy = {
  max_response_bytes: number;
  fetch_timeout_ms: number;
  respect_robots_txt: boolean;
  user_agent: string;
  allowed_content_types: string[];
};

export type FetchOutcome =
  | {
      ok: true;
      body: string;
      httpStatus: number;
      contentType: string;
      finalUrl: string;
    }
  | {
      ok: false;
      httpStatus: number | null;
      contentType: string | null;
      error: string;
    };

export async function fetchTrustedPage(
  urlString: string,
  policy: CrawlPolicy
): Promise<FetchOutcome> {
  if (policy.respect_robots_txt) {
    const robots = await isAllowedByRobotsTxt(urlString, policy.user_agent);
    if (!robots.allowed) {
      return {
        ok: false,
        httpStatus: null,
        contentType: null,
        error: robots.reason ?? "Blocked by robots.txt",
      };
    }
  }

  let response: Response;
  try {
    response = await fetch(urlString, {
      method: "GET",
      headers: {
        "User-Agent": policy.user_agent,
        Accept: policy.allowed_content_types.join(", "),
      },
      signal: AbortSignal.timeout(policy.fetch_timeout_ms),
      redirect: "follow",
    });
  } catch (e) {
    return {
      ok: false,
      httpStatus: null,
      contentType: null,
      error: e instanceof Error ? e.message : "Network error",
    };
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  const normalizedType = contentType.toLowerCase();

  if (!isAllowedContentType(normalizedType, policy.allowed_content_types)) {
    return {
      ok: false,
      httpStatus: response.status,
      contentType: normalizedType || null,
      error: `Unsupported content type: ${contentType || "unknown"}`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      httpStatus: response.status,
      contentType: normalizedType || null,
      error: `HTTP ${response.status} ${response.statusText}`,
    };
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > policy.max_response_bytes) {
    return {
      ok: false,
      httpStatus: response.status,
      contentType: normalizedType,
      error: `Response exceeds max size (${policy.max_response_bytes} bytes)`,
    };
  }

  const body = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  return {
    ok: true,
    body,
    httpStatus: response.status,
    contentType: normalizedType,
    finalUrl: response.url,
  };
}

function isAllowedContentType(actual: string, allowed: string[]): boolean {
  if (!actual) return false;
  return allowed.some((a) => {
    const norm = a.toLowerCase();
    return actual === norm || actual.startsWith(`${norm};`);
  });
}
