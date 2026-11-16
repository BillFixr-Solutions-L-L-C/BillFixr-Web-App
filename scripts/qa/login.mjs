// Logs a Playwright browser in as any existing user, without a password.
//
// Why this works: the service-role key can mint a one-time magic-link token
// for an email (`auth.admin.generateLink`), and this app already has a
// server-side redeemer at /auth/confirm that calls verifyOtp with a
// token_hash and sets the session cookies. So the helper generates a token
// and drives the browser through that route. Nothing is emailed --
// generateLink only generates -- and no password is needed or stored.
//
// The alternative was seeding a QA account with a known password, which is
// a standing credential living in a file. A token minted per run and
// redeemed once is not.
//
// Usage:
//   node scripts/qa/login.mjs --email someone@example.com
//   node scripts/qa/login.mjs --email x@y.com --base http://localhost:3000
//   node scripts/qa/login.mjs --email x@y.com --goto /dashboard --shot out.png
//
// Or from another script:
//   import { loginAs } from "./scripts/qa/login.mjs";
//   const { browser, page } = await loginAs({ email, base });
//
// Saves the session to a storageState file so later runs can skip the hop:
//   node scripts/qa/login.mjs --email x@y.com --state qa-state.json
//   ... then in Playwright: browser.newContext({ storageState: "qa-state.json" })
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

/** Reads .env.local without printing anything from it. */
export function readEnvLocal(root = REPO_ROOT) {
  const file = path.join(root, ".env.local");
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
  );
}

/**
 * Mints a one-time login token for `email`.
 * Returns the token_hash that /auth/confirm expects.
 */
export async function mintLoginToken(email, env = readEnvLocal()) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local");
  }
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error) {
    // A user that does not exist is the common case here, and Supabase's
    // message for it is unhelpful on its own.
    throw new Error(`could not mint a login token for ${email}: ${error.message}`);
  }
  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) throw new Error("Supabase returned no hashed_token");
  return tokenHash;
}

/**
 * Opens a browser already logged in as `email`.
 * Caller is responsible for closing `browser`.
 */
export async function loginAs({
  email,
  base = "http://localhost:3000",
  goto = "/dashboard",
  viewport = { width: 1440, height: 1000 },
  headless = true,
} = {}) {
  const tokenHash = await mintLoginToken(email);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  // The redeemer is a GET that sets cookies and redirects, so a plain
  // navigation is the whole login.
  const confirm = `${base.replace(/\/$/, "")}/auth/confirm?token_hash=${encodeURIComponent(
    tokenHash,
  )}&type=magiclink&next=${encodeURIComponent(goto)}`;
  await page.goto(confirm, { waitUntil: "networkidle" });

  const landed = new URL(page.url());
  if (landed.pathname.startsWith("/login")) {
    await browser.close();
    throw new Error(
      `login was rejected and bounced to ${landed.pathname}${landed.search} ` +
        `-- the token may have expired, or this base URL points at a different Supabase project`,
    );
  }

  return { browser, context, page, loggedInAt: landed.toString() };
}

// --- CLI ------------------------------------------------------------------

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const email = arg("email");
  if (!email) {
    console.error("usage: node scripts/qa/login.mjs --email <address> [--base URL] [--goto PATH] [--shot FILE] [--state FILE]");
    process.exit(1);
  }
  const base = arg("base", "http://localhost:3000");
  const goto = arg("goto", "/dashboard");

  const { browser, context, page, loggedInAt } = await loginAs({ email, base, goto });
  console.log(`logged in as ${email}`);
  console.log(`landed on    ${loggedInAt}`);

  const shot = arg("shot");
  if (shot) {
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`screenshot   ${shot}`);
  }
  const state = arg("state");
  if (state) {
    await context.storageState({ path: state });
    console.log(`session      ${state}`);
  }
  await browser.close();
}
