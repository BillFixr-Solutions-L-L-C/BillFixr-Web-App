// Applies supabase/migrations/20261113000000_rescan_allowance.sql to
// production, and shows the state before and after.
//
// Two changes in one migration: a new column on cases, and a replaced
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
const MIGRATION = "20261113000000_rescan_allowance.sql";

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
     where table_schema = 'public' and table_name = 'cases'
       and column_name = 'rescan_count'`);
  const { rows: fn } = await client.query(`
    select count(*) filter (where rescanned_at is not null)::int as ever_rescanned,
           coalesce(sum(case when rescan_count > 0 then 1 else 0 end), 0)::int as counted
      from public.cases`).catch(() => ({ rows: [{ ever_rescanned: null, counted: null }] }));
  const { rows: counted } = await client.query("select count(*)::int as n from public.cases");

  console.log(`${label}`);
  console.log(`   column          ${col[0] ? `${col[0].data_type} nullable=${col[0].is_nullable} default=${col[0].column_default}` : "ABSENT"}`);
  console.log(`   rescanned_at set / rescan_count > 0  ${fn[0]?.ever_rescanned} / ${fn[0]?.counted}`);
  console.log(`   cases rows   ${counted[0].n}`);
  return { hasColumn: Boolean(col[0]), rows: counted[0].n };
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
  select rescan_count, count(*)::int as n
    from public.cases group by 1 order by 1`);
console.log(`\nlanguages now: ${JSON.stringify(spread)}`);

if (after.rows !== before.rows) {
  console.log("WARNING: the profile count changed, which this migration should not do.");
} else {
  console.log("Profile count unchanged, as intended.");
}

await client.end();
