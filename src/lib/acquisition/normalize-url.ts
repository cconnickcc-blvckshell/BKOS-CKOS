/** Normalize user-submitted URL for fetch jobs (no crawling). */
export function normalizeSourceUrl(input: string): string {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP(S) URLs are supported");
  }
  url.hash = "";
  return url.toString();
}

export function hostnameFromUrl(urlString: string): string {
  return new URL(urlString).hostname.toLowerCase();
}
