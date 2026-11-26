// Screenshots the notification panel with real message text in it, at
// desktop and phone widths, so "it's cut" can be seen rather than argued
// about from the CSS.
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { mintLoginToken, readEnvLocal } from "file:///C:/Users/John%20Dansu/OneDrive/Desktop/BillFixr/scripts/qa/login.mjs";

const ROOT = "C:/Users/John Dansu/OneDrive/Desktop/BillFixr";
const OUT = process.argv[2];
const env = readEnvLocal(ROOT);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { userId, email } = JSON.parse(readFileSync(`${ROOT}/scripts/qa/.out/qa-account.json`, "utf8"));

// The real strings the app writes, longest first -- these are what the
// customer actually sees, not invented filler.
const MESSAGES = [
  "We sent your dispute letter to your provider. They typically reply within a few weeks.",
  "Your provider replied. Open your case to see what they said.",
  "The provider is asking for written authorisation from you before they will discuss the bill.",
  "Good news - your provider agreed to reduce your bill by $1,500.00.",
];
await db.from("notifications").delete().eq("user_id", userId);
await db.from("notifications").insert(
  MESSAGES.map((message, i) => ({
    user_id: userId,
    type: "provider_replied",
    message,
    read: i > 2,
  })),
);

const mod = await import(pathToFileURL(`${ROOT}/scripts/qa/.out/pw/node_modules/playwright/index.js`).href);
const chromium = (mod.default ?? mod).chromium;
const browser = await chromium.launch({ headless: true });
for (const [label, width, height] of [["desktop", 1440, 900], ["phone", 390, 844]]) {
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  // A fresh token per context: these are single use, so reusing one left
  // the second viewport looking at "that link is invalid or has expired"
  // instead of the dashboard.
  const token = await mintLoginToken(email, env);
  const hash = typeof token === "string" ? token : token.token_hash ?? token.hashed_token;
  const BASE = process.argv[3] ?? "https://www.billfixr.com";
  await page.goto(`${BASE}/auth/confirm?token_hash=${hash}&type=magiclink&next=/dashboard`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(4000);
  // The bell is the only button carrying an svg in the header area.
  const bell = page.getByRole("button", { name: /Notifications|Notificaciones/i }).locator("visible=true").first();
  await bell.click({ timeout: 20_000 }).catch((e) => console.log(`${label}: could not click the bell: ${String(e).slice(0,90)}`));
  await page.waitForTimeout(1200);
  // Where the panel actually sits, which is the thing in question.
  const box = await page.locator("div.w-80").first().boundingBox().catch(() => null);
  if (box) console.log(`${label}: panel x=${Math.round(box.x)} width=${Math.round(box.width)} right=${Math.round(box.x + box.width)} (viewport ${width})`);
  else console.log(`${label}: panel not found`);
  await page.screenshot({ path: `${OUT}/bell-${label}.png`, fullPage: false });
  console.log(`${label}: ${OUT}/bell-${label}.png`);
  await page.close();
}
await browser.close();
