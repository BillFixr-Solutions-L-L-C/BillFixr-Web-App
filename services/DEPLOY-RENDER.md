# Deploying the two Python services to Render

Neither service has ever been deployed. `render.yaml` beside this file is
the blueprint; this is what to put into it and the order to do it in.

**Order is not a preference.** ai-service reads bills into
`bill_extractions`; the engine negotiates from that extraction and refuses
to start a case without one. The table is empty today. Bring ai-service up
first and confirm a real bill comes out the other side before touching the
engine.

Until `AI_SERVICE_BASE_URL` and `AUTOMATION_ENGINE_BASE_URL` are set on
Vercel, the web app behaves exactly as it does now — every AI path answers
"unavailable". Setting those two variables is the switch that turns all of
this on, and it is the last step, not the first.

---

## Before you start

Have these to hand. Three of them are decisions, not lookups.

| Needed | Where it comes from |
| --- | --- |
| OpenRouter API key | The AI provider account. Both services use it. |
| Resend API key | **The web app's existing key**, from Vercel. See "Resend" below. |
| `advocate@billfixr.com` mailbox | A real mailbox at the mail host, with IMAP. See "The advocate mailbox". |
| Two API keys you invent | `LOCAL_API_KEY` and `ENGINE_API_KEY`. Any long random string. |
| A storage encryption key | `STORAGE_ENCRYPTION_KEY` for ai-service. |

Both services are deployed as **private services** (`type: pserv`): they
get an internal hostname and are not reachable from the internet. They
still check their API keys — a private network is not an authentication
story, and a mistake in Render's networking should not expose a service
that trusts anyone who can reach it.

Disks require a paid instance type; the blueprint uses `starter`. A disk
also pins its service to one instance, which costs nothing here — both
services keep their state in a SQLite file that could not be shared across
instances anyway.

Render only supports automatic health checks on web services, so there is
no `healthCheckPath` in the blueprint. Check `/health` and `/api/health`
by hand after each deploy.

---

## Step 1 — ai-service

Apply the blueprint, then set the three secrets in the Render dashboard:

| Variable | Notes |
| --- | --- |
| `LOCAL_API_KEY` | What the web app sends as `X-API-Key`. Invent it here, then set the same value as `AI_SERVICE_API_KEY` on Vercel. |
| `OPENROUTER_API_KEY` | |
| `STORAGE_ENCRYPTION_KEY` | Without it, stored bills sit in plaintext on the disk. |

Everything else is in the blueprint.

**Why the API and the worker run in one container.** `docker-compose.yml`
runs them as two services sharing a volume. A Render disk attaches to
exactly one service, and both halves read and write the same SQLite file —
the API enqueues a job, the worker picks it up. Split across two Render
services they would get two disks and two databases, and jobs would be
enqueued into a file nothing was reading. `render-start.sh` runs both and
exits if either stops.

**Check it worked:**

1. The service is live and `/health` returns ok.
2. Set `AI_SERVICE_BASE_URL` and `AI_SERVICE_API_KEY` on Vercel and
   redeploy.
3. Upload a real bill through the dashboard and confirm a row appears in
   `bill_extractions` with sensible values in it. **Read the values.** A
   row with the wrong totals is worse than no row, because the engine will
   negotiate from it.

Do not go on until a real bill has been read correctly.

---

## Step 2 — the advocate mailbox

Do this before the engine, because the engine's `From` address depends on
it and changing it afterwards means reconfiguring and redeploying.

The engine writes to hospitals and reads their replies. Both halves hang
on one address:

- **Sending.** Resend only sends from a domain verified on the account,
  which is `billfixr.com`. A `gmail.com` address in `ADVOCATE_EMAIL` means
  Resend rejects every send with a 422 and the engine falls back to SMTP —
  which works, and is completely untracked. That is the failure to watch
  for, because it looks like success.
- **Receiving.** Replies go wherever that address delivers. The inbound
  poller reads them over IMAP, and the negotiation does not advance
  without them.

So `advocate@billfixr.com` needs to be a real mailbox at
businessidentity.llc (the mail host — note that the registrar, Northwest
Registered Agent, is a different company), with IMAP credentials.

**The variable names are not what you would guess:** the poller
authenticates to IMAP with `SMTP_USER` and `SMTP_PASSWORD`. There is no
`IMAP_USER`. Setting one does nothing, and the poller stays silently
unconfigured — no error, just a negotiation that never sees a reply.

The same pair also arms the SMTP fallback, so set `SMTP_HOST` to the mail
host's SMTP server rather than leaving it on the `smtp.gmail.com` default.

### If the mailbox cannot be provisioned in time

Send from `advocate@billfixr.com` and set Reply-To to the existing Gmail.
Tracking works; replies keep arriving where they do today. The cost is
that a hospital sees a From and a Reply-To that disagree, on a letter
disputing a bill — which is exactly the kind of thing a billing office
treats as suspect. Prefer the real mailbox.

---

## Step 3 — the automation engine

Secrets to set:

| Variable | Notes |
| --- | --- |
| `ENGINE_API_KEY` | Without it **every route except `/api/health` is open**. Invent it, then set the same value as `AUTOMATION_ENGINE_API_KEY` on Vercel. |
| `OPENROUTER_API_KEY` | |
| `RESEND_API_KEY` | See below. |
| `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_HOST`, `IMAP_HOST` | The advocate mailbox from step 2. |

`ADVOCATE_EMAIL` is in the blueprint as `advocate@billfixr.com`. Change it
there if the mailbox ends up named something else.

### Resend

**Use the web app's existing key.** The webhook that records delivery is
registered on one Resend account, at
`https://www.billfixr.com/api/webhooks/resend`, for all six `email.*`
events. A key from a different account sends mail perfectly well and
reports nothing back — the letters go out and the admin screen stays
blank, which is the exact problem routing through Resend was meant to fix.

No new webhook is needed. The existing one already receives every event on
the account, and the engine tags each letter with the case id so the
webhook can attribute it.

**Open tracking stays off**, deliberately — see
`docs/DESIGN-SYSTEM.md` and the admin panel's wording. Delivery, bounces
and replies are what the team gets, and a reply is the only real proof a
provider read anything.

### The disk

`/app/data` holds the SQLite database and every revised-bill PDF. Without
the disk mounted they are lost on each deploy and restart — mid-negotiation
cases would vanish along with the letters already sent on them.

---

## Step 4 — turn it on

Set on Vercel, then redeploy:

| Variable | Value |
| --- | --- |
| `AI_SERVICE_BASE_URL` | the ai-service internal hostname |
| `AI_SERVICE_API_KEY` | matches `LOCAL_API_KEY` |
| `AUTOMATION_ENGINE_BASE_URL` | the engine internal hostname |
| `AUTOMATION_ENGINE_API_KEY` | matches `ENGINE_API_KEY` |

Then check, on one real case, in this order:

1. A bill uploads and is read.
2. A negotiation starts. The engine's SQLite has the case's id in
   `negotiations.external_ref`.
3. The letter arrives at a test address, and `letter_events` gains an
   `email.sent` and an `email.delivered` for that case within seconds.
4. Reply from the test address. The inbound poller picks it up and the
   negotiation advances. **This is the step most likely to fail**, because
   it depends on the Message-ID Resend assigned being read back correctly
   — see the engine notes in `docs/AUTOMATION-ENGINE.md`.

---

## Loose ends that are not blocking

- **Nothing runs the Python tests automatically.** 46 engine tests and 41
  ai-service tests exist; CI runs neither. Worth adding before these
  services carry real cases.
- **The `(dev) simulate provider response` button** is still live in
  production. The standing decision was to remove it once the AI endpoint
  was real. After step 4, it is.
- **The QA Super Admin** on the production Supabase project is still
  there, by decision, until testing finishes.
