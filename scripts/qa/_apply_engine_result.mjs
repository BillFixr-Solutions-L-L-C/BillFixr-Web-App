// Applies supabase/migrations/20261110000000_engine_reads_the_bill.sql to
// production and shows the table's columns before and after.
//
// Safe to apply BEFORE the code that uses it deploys: adding a nullable
// column is invisible to the running build, and dropping NOT NULL on
// `result` only widens what is accepted -- the currently deployed route
// always supplies it. Read-only without --apply.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

// `pg` is not a dependency of the web app, so it is resolved from
// wherever it is installed rather than added for a one-off DDL run.
// Point PG_MODULE at a local install if it is not on the path.
async function loadPg() {
  const spec = process.env.PG_MODULE ?? "pg";
  try {
    const mod = await import(spec.includes("/") ? pathToFileURL(spec).href : spec);
    return mod.default ?? mod;
  } catch {
    console.error("This script needs `pg`. Install it, e.g. npm i pg --no-save");
    process.exit(1);
  }
}
const pg = await loadPg();

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATION = "20261110000000_engine_reads_the_bill.sql";

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
  const { rows } = await client.query(`
    select column_name, data_type, is_nullable
      from information_schema.columns
     where table_schema = 'public' and table_name = 'bill_extractions'
     order by ordinal_position`);
  console.log(`${label}`);
  for (const r of rows) {
    console.log(`   ${r.column_name.padEnd(14)} ${r.data_type.padEnd(26)} nullable=${r.is_nullable}`);
  }
  const { rows: counted } = await client.query("select count(*)::int as n from public.bill_extractions");
  console.log(`   rows: ${counted[0].n}`);
  return rows;
}

const before = await state("BEFORE:");

if (!process.argv.includes("--apply")) {
  console.log("\nDRY RUN -- nothing changed. Re-run with --apply.");
  await client.end();
  process.exit(0);
}

await client.query(sql);
const after = await state("\nAFTER :");

const added = after.filter((a) => !before.some((b) => b.column_name === a.column_name));
console.log(`\ncolumns added: ${added.map((a) => a.column_name).join(", ") || "(none)"}`);
const resultCol = after.find((c) => c.column_name === "result");
console.log(`result nullable now: ${resultCol?.is_nullable}`);

await client.end();
