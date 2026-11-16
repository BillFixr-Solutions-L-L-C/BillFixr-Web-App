// Creates (or resets) a throwaway customer account for an end-to-end run.
//
// A customer, deliberately NOT an admin: the flow under test is the
// customer flow, and database reads for checking the result already go
// through the service role. An admin account would be privilege this test
// does not need.
//
// The password is generated here and written to the scratchpad, not to the
// transcript, and the account is deleted by _rmuser.mjs when the run is
// done.
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SP = `${ROOT}/scripts/qa/.out`;
mkdirSync(SP, { recursive: true });

const env = Object.fromEntries(
  readFileSync(`${ROOT}/.env.local`, "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// A Resend sink, so even a stray notification cannot reach a real inbox.
const EMAIL = "qa-e2e+bill@resend.dev";
const PASSWORD = `Qa-${randomBytes(12).toString("base64url")}`;

// Remove any leftover from a previous run so this is repeatable.
const { data: list } = await db.auth.admin.listUsers({ perPage: 200 });
const existing = (list?.users ?? []).find((u) => u.email === EMAIL);
if (existing) {
  await db.auth.admin.deleteUser(existing.id);
  console.log(`removed the previous ${EMAIL} (${existing.id.slice(0, 8)})`);
}

const { data: created, error } = await db.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  user_metadata: { name: "QA End To End" },
});
if (error || !created?.user) {
  console.error(`could not create the account: ${error?.message}`);
  process.exit(1);
}

const userId = created.user.id;
console.log(`created ${EMAIL}  id=${userId}`);

// The app reads profiles for the name/role; a trigger may already have made
// one, so this is an upsert rather than an insert.
// A complete profile. src/proxy.ts redirects to settings until address,
// city, postal_code, country and avatar_url are all present -- so without
// these the account cannot reach the upload screen at all. Filled here
// rather than driven through the settings form, because the settings form
// is not what this run is testing.
const { error: profileError } = await db.from("profiles").upsert(
  {
    id: userId,
    email: EMAIL,
    name: "QA End To End",
    role: "customer",
    address: "41 Market Street",
    city: "Burlington",
    postal_code: "05401",
    country: "United States",
    avatar_url: "https://www.billfixr.com/logo-icon-green.png",
    client_hospital_number: "QA-E2E-001",
  },
  { onConflict: "id" },
);
console.log(profileError ? `profile upsert failed: ${profileError.message}` : "profile ready (role=customer)");

const { data: profile } = await db.from("profiles").select("id, email, name, role, address, city, postal_code, country, avatar_url").eq("id", userId).single();
console.log(`profile row: ${JSON.stringify(profile)}`);

writeFileSync(
  `${SP}/qa-account.json`,
  JSON.stringify({ email: EMAIL, password: PASSWORD, userId }, null, 2),
  "utf8",
);
console.log(`credentials written to ${SP}/qa-account.json (password length ${PASSWORD.length}, not printed)`);
