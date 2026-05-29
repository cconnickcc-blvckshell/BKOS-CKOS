/**
 * Minimal robots.txt check for a single URL (no crawler).
 * Returns true if fetch is allowed for the URL path.
 */
export async function isAllowedByRobotsTxt(
  urlString: string,
  userAgent: string
): Promise<{ allowed: boolean; reason?: string }> {
  const url = new URL(urlString);
  const robotsUrl = `${url.protocol}//${url.host}/robots.txt`;

  let body: string;
  try {
    const res = await fetch(robotsUrl, {
      method: "GET",
      headers: { "User-Agent": userAgent, Accept: "text/plain,*/*" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (res.status === 404) return { allowed: true };
    if (!res.ok) {
      return { allowed: true, reason: `robots.txt returned ${res.status}; proceeding cautiously` };
    }
    body = await res.text();
  } catch {
    return { allowed: true, reason: "robots.txt unreachable; proceeding cautiously" };
  }

  const path = url.pathname || "/";
  const rules = parseRobotsForAgent(body, userAgent);
  if (rules.disallow.some((prefix) => prefix !== "" && path.startsWith(prefix))) {
    return { allowed: false, reason: `Disallowed by robots.txt for path ${path}` };
  }
  return { allowed: true };
}

function parseRobotsForAgent(
  body: string,
  userAgent: string
): { disallow: string[]; allow: string[] } {
  const lines = body.split(/\r?\n/);
  const groups: { agents: string[]; disallow: string[]; allow: string[] }[] = [];
  let current: { agents: string[]; disallow: string[]; allow: string[] } | null = null;

  for (const raw of lines) {
    const line = raw.split("#")[0]?.trim() ?? "";
    if (!line) continue;
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const k = key.toLowerCase();

    if (k === "user-agent") {
      if (current) groups.push(current);
      current = { agents: [value.toLowerCase()], disallow: [], allow: [] };
    } else if (current && k === "disallow") {
      current.disallow.push(value);
    } else if (current && k === "allow") {
      current.allow.push(value);
    }
  }
  if (current) groups.push(current);

  const ua = userAgent.toLowerCase();
  let match = groups.find((g) => g.agents.includes("*"));
  const specific = groups.find(
    (g) => g.agents.some((a) => ua.includes(a) || a.includes("ckos"))
  );
  if (specific) match = specific;

  return match ?? { disallow: [], allow: [] };
}
