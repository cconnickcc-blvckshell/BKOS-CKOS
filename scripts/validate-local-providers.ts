/**
 * Local-first provider configuration tests (no network).
 * Run: npm run test:local-providers
 */
import { openAiCompatibleBase } from "../src/lib/providers/http";
import { padEmbeddingForStorage } from "../src/lib/providers/embedding/vector-utils";
import { STORED_EMBEDDING_DIMENSIONS } from "../src/lib/providers/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}`);
  }
}

async function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void | Promise<void>
) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
    const v = vars[key];
    if (v === undefined) delete process.env[key];
    else process.env[key] = v;
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

async function main() {
console.log("CKOS local-first providers — offline tests\n");

assert(
  openAiCompatibleBase("http://localhost:11434") === "http://localhost:11434/v1",
  "openAiCompatibleBase appends /v1"
);
assert(
  openAiCompatibleBase("http://localhost:1234/v1") === "http://localhost:1234/v1",
  "openAiCompatibleBase preserves /v1"
);

const padded = padEmbeddingForStorage(new Array(768).fill(0.1));
assert(padded.length === STORED_EMBEDDING_DIMENSIONS, "pads 768-dim vector to stored size");

await withEnv(
  {
    AI_PROVIDER: "disabled",
    EMBEDDING_PROVIDER: "disabled",
    OPENAI_API_KEY: undefined,
    AI_API_KEY: undefined,
  },
  async () => {
    const { getAiRuntimeConfig } = await import("../src/lib/providers/ai/config");
    const { isAiProviderEnabled } = await import("../src/lib/providers/ai");
    const { getEmbeddingRuntimeConfig } = await import(
      "../src/lib/providers/embedding/config"
    );
    const { isEmbeddingProviderEnabled } = await import(
      "../src/lib/providers/embedding"
    );

    const ai = getAiRuntimeConfig();
    const emb = getEmbeddingRuntimeConfig();
    assert(ai.kind === "disabled" && !ai.enabled, "AI_PROVIDER=disabled");
    assert(emb.kind === "disabled" && !emb.enabled, "EMBEDDING_PROVIDER=disabled");
    assert(!isAiProviderEnabled(), "AI disabled — no provider required");
    assert(!isEmbeddingProviderEnabled(), "embeddings disabled — no OpenAI required");
  }
);

await withEnv(
  {
    AI_PROVIDER: "openai_compatible",
    AI_BASE_URL: "http://localhost:1234/v1",
    AI_MODEL: "qwen",
    AI_API_KEY: "",
    OPENAI_API_KEY: undefined,
  },
  async () => {
    const { getAiRuntimeConfig } = await import("../src/lib/providers/ai/config");
    const { isAiProviderEnabled, getAiProviderStatusMessage } = await import(
      "../src/lib/providers/ai"
    );
    const cfg = getAiRuntimeConfig();
    assert(cfg.kind === "openai_compatible", "openai_compatible AI kind");
    assert(cfg.baseUrl.includes("1234"), "AI_BASE_URL from env");
    assert(isAiProviderEnabled(), "openai_compatible enabled with base URL");
    assert(!getAiProviderStatusMessage(), "no status error when configured");
    assert(!process.env.OPENAI_API_KEY, "OpenAI env not required");
  }
);

await withEnv(
  {
    EMBEDDING_PROVIDER: "ollama",
    EMBEDDING_BASE_URL: "http://localhost:11434",
    EMBEDDING_MODEL: "nomic-embed-text",
    EMBEDDING_DIMENSIONS: "768",
  },
  async () => {
    const { getEmbeddingRuntimeConfig } = await import(
      "../src/lib/providers/embedding/config"
    );
    const { isEmbeddingProviderEnabled } = await import(
      "../src/lib/providers/embedding"
    );
    const cfg = getEmbeddingRuntimeConfig();
    assert(cfg.kind === "ollama", "ollama embedding kind");
    assert(cfg.dimensions === 768, "EMBEDDING_DIMENSIONS parsed");
    assert(isEmbeddingProviderEnabled(), "ollama embedding enabled");
  }
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
}

main();
