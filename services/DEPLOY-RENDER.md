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
| `advocate@billfixr.com` mailbox | A real mailbox on Purelymail, with IMAP, plus the MX/SPF/DKIM change that implies. See "The advocate mailbox". |
| Two API keys you invent | `LOCAL_API_KEY` and `ENGINE_API_KEY`. Any long random string. |
| A storage encryption key | `STORAGE_ENCRYPTION_KEY` for ai-service. **Must be a Fernet key, not any random string** — see Step 1. |

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

**This paragraph and the two above it describe `render.yaml`, the paid
blueprint.** The testing-phase blueprints beside it —
`render-free.yaml` (both services) and `render-ai-only.yaml` (the first
deploy, ai-service alone) — differ on all three points: free instances
are web-only, so the services are internet-facing and do get a
`healthCheckPath`, and they cannot have a disk, so everything written to
the filesystem is lost on each spin-down. Their own headers explain what
that costs. ai-service is currently running on `render-ai-only.yaml`.

---

## Step 1 — ai-service

Apply the blueprint, then set the three secrets in the Render dashboard:

| Variable | Notes |
| --- | --- |
| `LOCAL_API_KEY` | What the web app sends as `X-API-Key`. Invent it here, then set the same value as `AI_SERVICE_API_KEY` on Vercel. |
| `OPENROUTER_API_KEY` | |
| `STORAGE_ENCRYPTION_KEY` | Without it, stored bills sit in plaintext on the disk. **Not any random string — see below.** |

Everything else is in the blueprint.

### `STORAGE_ENCRYPTION_KEY` must be a Fernet key

The table above used to call this "a storage encryption key", and the two
invented API keys beside it are genuinely "any long random string". This
one is not. `app/storage.py` passes the value straight to `Fernet()`,
which accepts only 32 url-safe base64-encoded bytes — 44 characters
ending in `=`. Generate it, do not invent it:

```
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

**Why this matters more than it looks.** A 64-character hex string — the
obvious thing to generate, and what was very nearly deployed on
2026-11-04 — fails in the worst available way:

- `app/readiness.py` only tests the value for truthiness, so the startup
  banner prints `bills encrypted at rest: yes`
- `/health` reports `storage_encrypted: true` for the same reason
- nothing fails until the first upload, when `Fernet()` raises
  `ValueError: Fernet key must be 32 url-safe base64-encoded bytes`

So every check you would think to run says the service is healthy and
encrypting, while in fact no bill can be stored at all. Confirmed by
running `Fernet()` against a hex key before deploying rather than after.

If you ever rotate this key, bills encrypted with the old one cannot be
read back. On the free tier that is moot — there is no disk and storage
is wiped on every spin-down.

**Why the API and the worker run in one container.** `docker-compose.yml`
runs them as two services sharing a volume. A Render disk attaches to
exactly one service, and both halves read and write the same SQLite file —
the API enqueues a job, the worker picks it up. Split across two Render
services they would get two disks and two databases, and jobs would be
enqueued into a file nothing was reading. `render-start.sh` runs both and
exits if either stops.

### It checks itself on startup, too

Same bargain as the engine. The deploy log opens with:

```
BillFixr ai-service - configuration check
  API key required      : yes
  extraction configured : yes
  bills encrypted at rest: yes
  no problems found
```

**It refuses to start without `LOCAL_API_KEY`**, and exits non-zero so the
deploy fails. That is not only about the key check: with it unset,
`app/auth.py` hands back a principal marked unauthenticated, and the role
checks and the per-document ownership checks then pass for everyone —
anyone who could reach the service could read any uploaded bill.
`AI_SERVICE_ALLOW_INCOMPLETE=1` overrides it, for local work only.

Plaintext storage (no `STORAGE_ENCRYPTION_KEY`) is a warning rather than a
refusal. `/health` reports `ready`, `auth_enabled` and `storage_encrypted`
so a deploy can be checked without reading logs.

**Check it worked:**

1. The service is live and `/health` returns ok.
2. Set `AI_SERVICE_BASE_URL` and `AI_SERVICE_API_KEY` on Vercel and
   redeploy.
3. Upload a real bill through the dashboard and confirm a row appears in
   `bill_extractions` with sensible values in it. **Read the values.** A
   row with the wrong totals is worse than no row, because the engine will
   negotiate from it.

Do not go on until a real bill has been read correctly.

### What the first real deploy found — 2026-11-04

ai-service is now deployed, on the free tier via `render-ai-only.yaml`:
`billfixr-ai-service-test-e92h`, workspace `tea-dagro66k1f9s73dlsd10`.
A real bill has been read correctly through it (Children's Colorado
sample statement — provider, account number, statement and due dates and
the $82.30 balance all correct, stored `.enc`, malware scan clean). Four
things that only showed up by doing it:

**The Dockerfile did not contain the start command.** It copied `app/`
and `scripts/` but never `render-start.sh`, while both blueprints set
`dockerCommand: ./render-start.sh`. The image built fine and the
container exited with **status 128** immediately. Fixed in `e420969`.
Worth knowing because the build log is entirely clean — the failure is
one line at the very end, after a successful push to the registry.

**Pushes do not deploy themselves.** `autoDeploy` is `yes` with trigger
`commit`, but pushing the fix to `main` triggered nothing; the deploy had
to be started by hand (`render deploys create <srv-id>`). The GitHub
webhook is not connected to this workspace. Until it is, treat every
deploy as manual — a pushed fix that appears to do nothing has not
necessarily failed, it may simply not have been built.

**Blueprints are read from the repository, not from disk.** `--path` is
repo-relative, so a blueprint change has to be committed and pushed
before it can be applied. There is no way to try a local edit.

**Extraction is thin on the money fields.** That first bill came back
with `confidence: 0.35`, `total_charges: null` and `line_items: []`,
having read all five pages. The balance and the identifiers were right.
This is the thing to watch, because the engine negotiates from line
items — and it is the AI/ML workstream, not this one. Re-test with a bill
that has a real itemized charge table before drawing any conclusion about
whether the app layer is losing the data or the model is not finding it.

**The Render CLI needs installing properly.** The npm package's shim is
broken on this machine, and the CLI token it saved in `~/.render/cli.yaml`
is rejected by the public REST API (401), so neither route works. The
official Windows binary from
`github.com/render-oss/cli/releases` does work and is self-contained.

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

So `advocate@billfixr.com` needs to be a real mailbox with IMAP
credentials.

### Where the mailbox is going: Purelymail

**Decision (2026-11-04):** the mailbox is being created on
**Purelymail**, not on the current mail host. This supersedes an earlier
version of this section which said *no DNS change is needed* — that was
true only while the mailbox was going to live at businessidentity.llc.
**It now requires a DNS change, and that change moves the whole domain's
inbound mail.**

What is unaffected: `billfixr.com` is **verified** in Resend (region
`us-east-1`) and its DKIM sits at the `resend._domainkey` selector.
Purelymail uses different selectors, so the two coexist. Resend still
sends; Purelymail only receives, plus arms the SMTP fallback. No new
Resend domain and no webhook change.

### Google Workspace — closed, not resolved

**Closed by the user 2026-11-04.** The user raised that Google Workspace
is still in use, then directed that it not gate this work. Recorded here
because the facts are evidence, not an open action:

- `billfixr.com` MX pointed at `mailserver.businessidentity.llc`; a
  Workspace domain would publish `aspmx.l.google.com` plus four `alt*`
  records
- no `google._domainkey`, no Google site-verification TXT, no
  `include:_spf.google.com` in SPF

On that evidence `@billfixr.com` mail was never delivered to Google, so
the Workspace account is most likely on another domain and untouched by
any of this. Weak corroboration: MX was switched to Purelymail and
reverted the same day, and no mail breakage was reported in that window.

The residual risk, if it turns out to be wrong, is that `@billfixr.com`
mail was being collected into Gmail from the old host — in which case
that collection stops when MX moves, with no error, and the fix is to
repoint it at Purelymail. **The MX switch is no longer gated on this.**

### Who can actually edit the zone

**Not us, and not the registrar.** Checked 2026-11-04, `billfixr.com`
delegates to:

```
ns1.hosting.businessidentity.llc
ns2.hosting.businessidentity.llc
```

So the zone is hosted by **businessidentity.llc**. Northwest Registered
Agent is only the registrar — it controls which nameservers the domain
delegates to, not the records themselves. There is no record to edit in
the registrar's DNS panel, and looking for one there is a dead end.

Every record below is therefore a **request to whoever administers
businessidentity.llc** — the same party the mailbox is being moved away
from. They are not obstructing anything; they simply hold the zone.

If being blocked on a third party for every DNS change becomes a
problem, the fix is to move DNS hosting (to Cloudflare, or to the
registrar's own DNS) by changing the nameservers at Northwest. That is
a deliberate migration, not a quick win: **the entire existing zone must
be replicated at the new provider before the nameservers are flipped**,
or the website and all mail break at once. Ask them for a zone export
first rather than trying to enumerate it from outside — and note the
zone contains a wildcard `*` A record, which makes an omission look
like a working record instead of an error.

### The DNS change, and what it takes with it

Live state of the zone, checked 2026-11-04:

| Record | Current value |
| --- | --- |
| MX | `mailserver.businessidentity.llc`, priority 10 |
| SPF (TXT) | `v=spf1 a mx include:spf.postal.businessidentity.llc include:amazonses.com ~all` |
| DMARC | `v=DMARC1; p=quarantine; rua=mailto:bounce@dmarc.businessidentity.llc; ruf=...; fo=1` |

Four things follow, in order of how badly they fail:

**1. The MX move takes every `@billfixr.com` address with it.** MX is
per-domain, not per-mailbox. Pointing it at Purelymail moves *all*
inbound mail for `billfixr.com` off the current host. **Confirm what
other addresses are live there before flipping it** — they stop
receiving the moment it changes. Remove the old MX rather than leaving
both: two MX records across two providers means some mail is delivered
to the host nobody is polling, with no error anywhere.

**2. DMARC is `p=quarantine`, not `p=none`.** Mail from the domain that
fails both SPF and DKIM alignment gets quarantined, not merely flagged.
So Purelymail's DKIM — **three CNAME records**, not TXT — must be live
and verified *before* anything sends through it. Add the ownership TXT,
the merged SPF and the three DKIM CNAMEs first; all four are inert while
MX still points elsewhere. Flip MX last.

Purelymail also requires a **`purelymail_ownership_proof` TXT record**
before the domain can be added to the account at all. It is unrelated to
mail routing and safe to add at any time, so it is the natural first
step.

**3. SPF must be merged, not added, and the bare `mx` mechanism changes
meaning on its own.** Only one `v=spf1` record is allowed per domain, so
Purelymail's include goes into the existing record:

```
v=spf1 a mx include:_spf.purelymail.com include:spf.postal.businessidentity.llc include:amazonses.com ~all
```

Keep `include:spf.postal.businessidentity.llc` only if something still
sends through the old host; drop it otherwise. Note that the bare `mx`
mechanism authorizes whatever MX points at, so moving MX silently
re-points part of this record at Purelymail's *inbound* servers, which
are not necessarily its outbound ones — that is why the explicit include
is needed and the `mx` mechanism is not a substitute.

Lookup budget is fine: all three includes resolve to flat `ip4` lists
with no nesting, so the merged record costs **5 of the 10** permitted
DNS lookups. No `permerror` risk.

**4. The DMARC failure reports go to the host being moved away from.**
`rua` and `ruf` both point at `dmarc.businessidentity.llc`, with
`fo=1`. If alignment breaks after the move, the reports that would say
so are delivered to the other party and you see nothing. Worth adding
your own address to `rua` as part of this change.

The zone also has a wildcard `*` A record that has silently masked a
missing record before — so verify each new record resolves by querying
it directly, rather than trusting the registrar's panel.

### The settings

| Setting | Value |
| --- | --- |
| IMAP host | `imap.purelymail.com`, port **993**, implicit TLS |
| SMTP host | `smtp.purelymail.com`, port **465**, implicit TLS |
| MX target | `mailserver.purelymail.com` — **confirm the exact value and priority in the Purelymail admin portal**, which issues it per domain |
| Username | the full address, `advocate@billfixr.com` |

The records Purelymail asks for, by type: ownership `TXT`
(`purelymail_ownership_proof`), `MX`, SPF `TXT` (merged into the
domain's single SPF record), and DKIM as **three `CNAME` records**
(`purelymail1/2/3._domainkey` → `key1/2/3.dkimroot.purelymail.com.`).

### Two of Purelymail's suggested records must NOT be used as given

Their setup page offers each record as though the domain were new. Two
of them would break what is already live:

**SPF — do not paste their value.** They give
`v=spf1 include:_spf.purelymail.com ~all`. Pasting that as the domain's
SPF record drops `include:amazonses.com`, which is Resend's send path —
so every letter the engine sends would begin failing SPF, and with
DMARC at `p=quarantine` would be quarantined. Their include must be
merged into the existing record instead:

```
v=spf1 a mx include:_spf.purelymail.com include:spf.postal.businessidentity.llc include:amazonses.com ~all
```

**DMARC — do not add their CNAME.** They offer
`CNAME _dmarc → dmarcroot.purelymail.com.`. This domain already
publishes a DMARC `TXT` at `_dmarc` with `p=quarantine`. DNS forbids a
CNAME coexisting with any other record at the same name, so adding it
either fails outright or clobbers the existing policy — and it would
hand DMARC policy and report delivery to Purelymail. Keep the existing
TXT record.

The AutoConfig `CNAME` and AutoDiscover `SRV` records are optional
client-convenience records. The engine connects to explicit hostnames
from `render.yaml`, so neither is needed; skip both.


Both hosts and both ports are set in `render.yaml` and
`render-free.yaml`; only `SMTP_USER` and `SMTP_PASSWORD` are entered at
approval time. Purelymail documents 993/465, which is what the code
already wanted — the 587-vs-465 note below is unchanged by the move.

That the code copes with 465 is not luck but it is close: the dispatcher
uses `SMTP_SSL` when `SMTP_PORT` is 465, and otherwise tries STARTTLS and
falls back to 465 only after an 8-second connection timeout. Leaving
`SMTP_PORT` unset would have worked while wasting 8 seconds on every
fallback send.

**The variable names are not what you would guess:** the poller
authenticates to IMAP with `SMTP_USER` and `SMTP_PASSWORD`. There is no
`IMAP_USER`. Setting one does nothing, and the poller stays silently
unconfigured — no error, just a negotiation that never sees a reply.

### What to ask for

Plain wording, since the mailbox request may be relayed by someone
non-technical:

> Please create **advocate@billfixr.com** as a real mailbox on
> Purelymail — one with its own password that can be signed into, not a
> forwarder or an alias. Our system has to sign in to read the replies,
> and an alias cannot be signed into. Please send the password, and the
> DNS records Purelymail gives you for the domain.

An alias or forward is the likely wrong turn: it would deliver mail
somewhere readable by a person while leaving the poller with nothing to
log into, which looks like a working mailbox right up until no reply is
ever picked up.

On a shared Purelymail account, note that whoever holds the account can
read this mailbox. Hospital replies quote patient names, account numbers
and dates of service, so who has account access is worth settling
deliberately rather than by default.

### Checking it before the engine goes anywhere near it

Once the credentials exist, the mailbox can be verified directly — log in
over IMAP, confirm the account opens and `INBOX` is selectable, and send
one message to it and read it back. Worth doing before deploying: an
authentication failure here is one of the two silent failures in this
whole system, and `/api/health` reports `replies_read` from whether the
variables are *set*, not from whether they *work*.

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

### It checks itself on startup

The engine inspects its configuration before it serves anything and prints
the result. The deploy log opens with:

```
BillFixr automation engine - configuration check
  letters tracked (Resend) : yes
  replies read (IMAP)      : NO
  API key required         : yes
  sending as               : advocate@billfixr.com
  [WARNING] SMTP_USER / SMTP_PASSWORD: ...
```

Read those four lines after every deploy. They are the difference between
a service that works and one that only looks like it does.

**It refuses to start** on anything critical — no `ENGINE_API_KEY`, no
`OPENROUTER_API_KEY`, or a `From` address Resend will reject — and exits
non-zero, so Render fails the deploy rather than quietly putting an open
API or an untracked sender into service. `ENGINE_ALLOW_INCOMPLETE=1`
overrides it; that is for local work, not for anywhere that can write to a
real hospital.

Untracked letters (no `RESEND_API_KEY`) and an unread inbox (no mailbox
credentials) are warnings, not refusals: sending untracked is bad, and not
sending at all is worse.

`/api/health` reports the same thing as booleans — `ready`,
`letters_tracked`, `replies_read`, `api_protected` — so it can be checked
without reading logs. It is outside the API key gate, so it says what is
configured and never what anything is set to.

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

- **Nothing runs the Python tests automatically.** 66 engine tests and 55
  ai-service tests exist; CI runs neither. Worth adding before these
  services carry real cases.
- **The `(dev) simulate provider response` button** is still live in
  production. The standing decision was to remove it once the AI endpoint
  was real. After step 4, it is.
- **The QA Super Admin** on the production Supabase project is still
  there, by decision, until testing finishes.
- **The engine's Docker image has still never been built.** The author
  never built it, and there is no Docker daemon on the machine this was
  prepared on. Its dependencies were checked against its imports and the
  service was booted directly from source, but the first real build will
  happen on Render. Watch that build.
