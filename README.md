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

The repository includes an isolated Python AI service at
`services/ai-service/` for ingestion, OCR, extraction, case analysis, and
draft generation. See `AI-SERVICE-INTEGRATION.md` for the frontend handoff
and integration path.

## How BillFixr is paid

A small commitment fee is charged when a bill is submitted for analysis.
If errors are found and the bill is successfully reduced, a success fee is
charged as a percentage of the savings. If no errors are found, no success
fee applies.
