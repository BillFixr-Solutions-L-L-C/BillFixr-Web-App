# BillFixr

Proprietary — © 2026 BillFixr Solutions, LLC. All rights reserved.

## About

Medical bills are confusing, error-prone, and expensive to dispute — most
people don't have the time, expertise, or energy to sit on the phone with a
billing department arguing over a duplicate charge or a misapplied
insurance rate. BillFixr exists to take that burden off patients entirely.

A user uploads a medical bill, and BillFixr's AI reviews it line by line to
catch billing errors, duplicate charges, mathematical mistakes, and
insurance coverage discrepancies — the kinds of overcharges that routinely
slip through and go unchallenged. When errors are found, BillFixr generates
a formal negotiation letter and handles the back-and-forth with the
provider on the patient's behalf, following up until a resolution is
reached, so the patient never has to make the call themselves.

The product is built around a simple promise: review before you pay. A
bill shouldn't have to be a burden, and BillFixr's job is to make sure
patients only ever pay what they actually owe.

## How it works

1. **Upload your bill** — the patient uploads their medical bill.
2. **We review & detect errors** — AI scans it for overcharges, duplicate
   fees, and coverage discrepancies.
3. **We negotiate for you** — BillFixr generates and sends negotiation
   documents to the provider, and follows up until it's resolved.
4. **You save money** — the patient receives their corrected, reduced
   bill.

## Who it's for

BillFixr is available to individuals 18 or older residing in the United
States who are reviewing a medical bill that belongs to them, or that they
have legal authorization to act on behalf of.

## AI backend

Two Python services under `services/`:

- `ai-service` — ingestion, OCR, extraction, case analysis, draft
  generation.
- `automation-engine` — audit rules and the negotiation autopilot
  (follow-ups, replies, settlement, the revised bill, the completion
  fee).

The web app reaches both through one seam, `src/lib/aiStack.ts`, which
answers what is configured, what is reachable, and where to look a
hospital's billing contacts up. Everything else goes to whichever service
owns it.

**Neither is deployed.** No `AI_SERVICE_BASE_URL` or
`AUTOMATION_ENGINE_BASE_URL` is set in any environment, so every AI path
answers "unavailable" and no case advances on its own. Deploying them is
the remaining work: see `docs/AUTOMATION-ENGINE.md`, which also covers the
order it has to happen in — the engine cannot start a negotiation until
something has extracted a bill.

CI runs the TypeScript suite only. The Python suites (32 for the engine,
41 for ai-service) have to be run by hand.

## How BillFixr is paid

A small commitment fee is charged when a bill is submitted for analysis.
If errors are found and the bill is successfully reduced, a success fee is
charged as a percentage of the savings. If no errors are found, no success
fee applies.
