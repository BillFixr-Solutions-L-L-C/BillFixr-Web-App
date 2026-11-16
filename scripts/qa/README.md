# QA and diagnostic scripts

Ad-hoc tooling written while building and auditing the app. They talk to
**production** — that is the point of them — so read the script before
you run it.

## How they get their credentials

Every script reads `.env.local` from the repo root and uses
`SUPABASE_SERVICE_ROLE_KEY`, which **bypasses RLS**. No key is written
down in any of these files, and none should ever be: if you need a new
one, add it to `.env.local` and read it the same way the others do.

`.env.local` is gitignored. These scripts are not, so never paste a
value into one.

## Safety

- Anything that changes data is **read-only until `--apply`** is passed,
  and records what it is about to touch into `scripts/qa/.out/` first.
- `_rmuser.mjs` and `_payclean.mjs` delete rows. Both are scoped — the
  first to one recorded account id, the second to payment rows Stripe
  itself confirms never took money — and both write a record before
  acting.
- Test email must go to a Resend sink (`delivered+…@resend.dev`) or to
  `advocate@billfixr.com`. **Never to a real provider**: a misaddressed
  dispute letter is a patient-data disclosure.
- Production Stripe is in TEST mode, so a scripted end-to-end run costs
  nothing. Check with `_stripemode.mjs` before assuming that still holds.

## Extra dependencies

Two scripts need packages the app does not depend on. They resolve them
normally and tell you what to install if they cannot:

```
npm i pg --no-save          # the _apply_*.mjs migration runners
npm i playwright --no-save && npx playwright install chromium   # _e2e.mjs, _mobile.mjs
```

Set `PG_MODULE` / `PLAYWRIGHT_MODULE` to an absolute path if you have
them installed somewhere else.

## What each one does

### Looking

| script | answers |
| --- | --- |
| `_flowcheck.mjs` | has any bill been all the way through? counts by stage |
| `_survey.mjs` | every bill and case, with what each is carrying |
| `_trace.mjs` | one case end to end, stage by stage |
| `_casefields.mjs` | the analysis columns on recent cases |
| `_replycheck.mjs` | which cases have a provider reply the engine has read |
| `_replybody.mjs` | one negotiation in full, including the reply text |
| `_payaudit.mjs` | every payment record reconciled against Stripe |
| `_stripemode.mjs` | is the configured Stripe key TEST or LIVE? |
| `_aihealth.mjs` | is the AI service reachable from production right now? |
| `_adminroles.mjs` | which admins hold which role, and what it grants |
| `_adminaccess.mjs` | the domain-access grid |
| `_domacc.mjs` | access levels for one domain |
| `_untranslated.mjs` | customer-facing strings with no translation |
| `_mobile.mjs` | renders pages at phone width and reports overflow |

### Changing

| script | does | guard |
| --- | --- | --- |
| `_apply_engine_result.mjs` | runs a migration | `--apply` |
| `_apply_language_migration.mjs` | runs a migration | `--apply` |
| `_apply_rescan_migration.mjs` | runs a migration | `--apply` |
| `_mkuser.mjs` | creates a throwaway QA account | — |
| `_rmuser.mjs` | deletes that account and its rows | `--apply`, scoped to a recorded id |
| `_payclean.mjs` | deletes payment rows Stripe says never paid | `--apply`, Stripe-confirmed only |
| `_e2e.mjs` | drives the whole flow in a browser | spends test-mode money only |
| `login.mjs` | mints a login link for an account (helper) | — |

## Output

Everything written goes to `scripts/qa/.out/`, which is gitignored.
