const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{8,}/gi,
  /Bearer\s+[a-zA-Z0-9._\-]+/gi,
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  /service[_-]?role[_-]?key["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  /api[_-]?key["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  /SUPABASE_[A-Z_]+=["']?[^"'\s]+/gi,
];

const REDACT_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "api_key",
  "apikey",
  "password",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "service_role_key",
  "supabase_service_role_key",
  "openai_api_key",
  "ai_api_key",
  "embedding_api_key",
]);

export function redactString(value: string): string {
  let out = value;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}

export function redactMetadata(
  input: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!input) return {};
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    const lower = key.toLowerCase();
    if (REDACT_KEYS.has(lower) || lower.includes("secret") || lower.includes("password")) {
      out[key] = "[REDACTED]";
      continue;
    }
    if (typeof raw === "string") {
      out[key] = redactString(raw);
    } else if (Array.isArray(raw)) {
      out[key] = raw.map((v) =>
        typeof v === "string" ? redactString(v) : typeof v === "object" && v !== null ? redactMetadata(v as Record<string, unknown>) : v
      );
    } else if (raw && typeof raw === "object") {
      out[key] = redactMetadata(raw as Record<string, unknown>);
    } else {
      out[key] = raw;
    }
  }
  return out;
}
