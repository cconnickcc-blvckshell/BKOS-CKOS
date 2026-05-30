/**
 * Static migration order and dependency checker.
 * Run: npx tsx scripts/verify-migration-order.ts
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const createdTables = new Set<string>();
const createdFunctions = new Set<string>();
let passed = 0;
let failed = 0;

function ok(label: string) {
  passed++;
  console.log(`  ✓ ${label}`);
}

function fail(label: string, detail?: string) {
  failed++;
  console.log(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
}

function extractCreates(sql: string) {
  const tables: string[] = [];
  const refs: string[] = [];

  for (const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? public\.(\w+)/gi)) {
    tables.push(m[1]!);
  }
  for (const m of sql.matchAll(/CREATE(?: OR REPLACE)? FUNCTION public\.(\w+)/gi)) {
    createdFunctions.add(m[1]!);
  }
  for (const m of sql.matchAll(/REFERENCES public\.(\w+)/gi)) {
    refs.push(m[1]!);
  }
  // Only table REFERENCES / ALTER — ignore FROM/JOIN (may be functions)
  for (const m of sql.matchAll(/INSERT INTO public\.(\w+)/gi)) {
    refs.push(m[1]!);
  }
  for (const m of sql.matchAll(/ALTER TABLE public\.(\w+)/gi)) {
    refs.push(m[1]!);
  }

  return { tables, refs: [...new Set(refs)] };
}

console.log("CKOS migration order verification\n");
console.log(`Found ${files.length} migration files (lexicographic order).\n`);

if (files.length === 0) {
  fail("no migration files");
  process.exit(1);
}

for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
  const { tables, refs } = extractCreates(sql);

  const missing = refs.filter(
    (t) => !createdTables.has(t) && !tables.includes(t)
  );

  if (missing.length > 0) {
    const uniq = [...new Set(missing)];
    fail(`${file} references tables not yet created`, uniq.join(", "));
  } else {
    ok(`${file} (${tables.length} new tables, ${refs.length} refs checked)`);
  }

  for (const t of tables) {
    createdTables.add(t);
  }
}

console.log(`\n${passed} checks passed, ${failed} failed`);
console.log(`Tables created across chain: ${createdTables.size}`);

const expectedMin = 16;
if (files.length < expectedMin) {
  fail(`expected at least ${expectedMin} migrations, got ${files.length}`);
}

process.exit(failed > 0 ? 1 : 0);
