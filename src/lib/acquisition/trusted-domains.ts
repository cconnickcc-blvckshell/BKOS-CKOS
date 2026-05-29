export type TrustedDomainRow = {
  id: string;
  domain: string;
  label: string;
  is_active: boolean;
  allow_subdomains: boolean;
};

/** Returns matching trusted domain row or null. */
export function matchTrustedDomain(
  hostname: string,
  domains: TrustedDomainRow[]
): TrustedDomainRow | null {
  const host = hostname.toLowerCase();
  for (const row of domains) {
    if (!row.is_active) continue;
    const domain = row.domain.toLowerCase();
    if (host === domain) return row;
    if (row.allow_subdomains && host.endsWith(`.${domain}`)) return row;
  }
  return null;
}

export function assertTrustedUrl(
  urlString: string,
  domains: TrustedDomainRow[]
): TrustedDomainRow {
  const hostname = new URL(urlString).hostname.toLowerCase();
  const match = matchTrustedDomain(hostname, domains);
  if (!match) {
    throw new Error(
      `Domain "${hostname}" is not on the trusted allowlist. Only user-submitted URLs from trusted domains can be fetched.`
    );
  }
  return match;
}
