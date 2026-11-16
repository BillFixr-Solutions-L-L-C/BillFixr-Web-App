// Applies supabase/migrations/20261111000000_communication_language.sql to
// production, and shows the state before and after.
//
// Two changes in one migration: a new column on profiles, and a replaced
// handle_new_user trigger function. Both are safe to apply BEFORE the code
// that uses them merges -- the running build never mentions the column,
// and the new function only reads an extra key out of the signup metadata
// that the current signup form does not send yet, falling back to 'en'.
//
// Read-only without --apply.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

// `pg` is not a dependency of the web app, so it is resolved from
// wherever it happens to be installed rather than added for a one-off DDL
// run. Point PG_MODULE at a local install if it is not on the path.
async function loadPg() {
  const spec = process.env.PG_MODULE ?? "pg";
  try {
    const mod = await import(spec.startsWith(".") || spec.includes("/") ? pathToFileURL(spec).href : spec);
    return mod.default ?? mod;
  } catch {
    console.error("This script needs `pg`. Install it, e.g. npm i pg --no-save");
    process.exit(1);
  }
}
const pg = await loadPg();

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATION = "20261111000000_communication_language.sql";

const env = Object.fromEntries(
  fs
    .readFileSync(`${ROOT}/.env.local`, "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);

const sql = fs.readFileSync(`${ROOT}/supabase/migrations/${MIGRATION}`, "utf8");
if (!env.DIRECT_URL) {
  console.error("DIRECT_URL is not in .env.local");
  process.exit(1);
}

const client = new pg.Client({ connectionString: env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

async function state(label) {
  const { rows: col } = await client.query(`
    select column_name, data_type, is_nullable, column_default
      from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'communication_language'`);
  const { rows: fn } = await client.query(`
    select position('communication_language' in pg_get_functiondef(p.oid)) > 0 as carries_language
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'handle_new_user'`);
  const { rows: counted } = await client.query("select count(*)::int as n from public.profiles");

  console.log(`${label}`);
  console.log(`   column          ${col[0] ? `${col[0].data_type} nullable=${col[0].is_nullable} default=${col[0].column_default}` : "ABSENT"}`);
  console.log(`   trigger carries it  ${fn[0]?.carries_language ?? "(no such function)"}`);
  console.log(`   profiles rows   ${counted[0].n}`);
  return { hasColumn: Boolean(col[0]), carries: fn[0]?.carries_language ?? false, rows: counted[0].n };
}

const before = await state("BEFORE:");

if (!process.argv.includes("--apply")) {
  console.log("\nDRY RUN -- nothing changed. Re-run with --apply.");
  await client.end();
  process.exit(0);
}

await client.query(sql);
const after = await state("\nAFTER :");

// Every existing profile must come out as 'en' -- the column is NOT NULL
// with a default, so no row should be left without a value.
const { rows: spread } = await client.query(`
  select communication_language, count(*)::int as n
    from public.profiles group by 1 order by 1`);
console.log(`\nlanguages now: ${JSON.stringify(spread)}`);

if (after.rows !== before.rows) {
  console.log("WARNING: the profile count changed, which this migration should not do.");
} else {
  console.log("Profile count unchanged, as intended.");
}

await client.end();
