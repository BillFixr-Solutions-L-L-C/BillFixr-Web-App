# Integrating the automation engine

The engine is a separate service. The web app talks to it through `src/lib/automation-engine.ts`, which follows the same pattern as `src/lib/ai-service.ts`. Most of the backend work is already done. What is left is the wiring below.

## 1. What is already built

- Audit rules with guardrails, benchmark data, and a closed list of citations
- The first dispute letter, built on the server
- The full negotiation: follow-ups, inbox reading, rebuttals, settlement, and the revised bill request
- Reading the revised bill (email text and PDF) and checking the agreed amount
- The completion fee calculation and the revised bill paywall
- Client notices
- Hospital contact lookup from a sourced directory (fills the `findProviderContact` stub in `src/lib/ai-service.ts`)
- A typed client with tests: `src/lib/automation-engine.ts`, `src/types/automation-engine.ts`

## 2. What the web app still has to do

1. **Deploy the engine** (Docker image or `python server.py`). Set `ENGINE_API_KEY`, `OPENROUTER_API_KEY`, the SMTP and IMAP settings, `ENABLE_DEMO_UI=0`, and a persistent volume.
2. **Add two environment variables to the web app:** `AUTOMATION_ENGINE_BASE_URL` and `AUTOMATION_ENGINE_API_KEY` (the same value as `ENGINE_API_KEY`).
3. **Call the engine in this order** (server side only):

   | Step | When | Call |
   | --- | --- | --- |
   | Audit | After extraction | `auditBill(billData)` |
   | Start | After the commitment fee is paid in Stripe | `startNegotiation({ auditResult, initialOffer, hospitalEmail, commitmentPaymentRef, completionFeeRate })` |
   | Follow | While the case is open | `getNegotiation(id)` on a timer, or when the case page loads |
   | Charge | When status is `AWAITING_COMPLETION_FEE` | Create a Stripe payment for `completion_fee` |
   | Unlock | After that payment succeeds (Stripe webhook) | `confirmCompletionPayment(id, paymentIntentId)` |
   | Show | After unlock | Stream `fetchRevisedBillPdf(id)` from an authenticated route |

4. **Take the fee rates from the admin pricing settings.** Pass the percentage as `completionFeeRate` when starting a case. The engine's default (10%) is used if you leave it out. `getEngineFees()` returns the defaults.
5. **Authorise every call.** The engine trusts anyone holding the API key. Check that the signed-in user owns the case before calling it, including the PDF route.
6. **Show client notices.** Messages with `direction: "SYSTEM"` are notices for the client. Map them to the `notifications` table.
7. **Replace the demo storage** (see section 4).
8. **Switch the contact lookup to the engine** (see section 4b).
9. **Decide the overlap with `services/ai-service`** (see section 5).

## 3. Mapping to the existing Supabase tables

These are the likely fits. Check the columns before relying on them.

| Engine data | Likely table |
| --- | --- |
| A negotiation (status, offer, settled amount, fees) | `cases` (add columns, or a new `negotiations` table keyed by case) |
| `OUTBOUND` and `INBOUND` messages | `communication_logs` |
| Follow-up schedule (`cadence_step`) | `follow_ups` |
| `SYSTEM` messages | `notifications` |
| Commitment and completion payments, with Stripe references | `payment_records` |
| The revised bill PDF | Supabase Storage, next to `case_documents` |

## 4. Replacing the demo storage

`database.py` holds a SQLite store behind one class, `NegotiationRepository`. These are the methods the rest of the engine uses:

`create_negotiation`, `get_negotiation`, `list_negotiations`, `add_message`, `update_negotiation_offer`, `update_threading`, `update_fields`, `toggle_auto_pilot`, `update_cadence`, `close_case`, `get_revised_bill`, `get_revised_bill_pdf_path`

Keep their signatures and return shapes and the rest of the engine does not change. Two rules to keep:

- `get_negotiation` must hide `revised_bill_markdown` until `completion_paid` is true. This is the paywall.
- The PDF file path must never be returned to a client.

Revised bill PDFs are written to `ENGINE_DATA_DIR/revised_bills/`. Swap `engine/revised_bill.py: save_pdf` for Supabase Storage if the engine should be stateless.

## 4a. Endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Health. Open without the API key. |
| `GET /api/fees` | Default commitment fee and completion fee rate |
| `POST /api/audit` | Audit extracted bill data |
| `POST /api/providers/contact` | Look up a hospital's billing contacts. Body: `provider_name`, optional `address` |
| `POST /api/negotiations/start` | Start a case. Needs `commitment_paid: true` |
| `GET /api/negotiations/{id}` | Case state, messages, and notices |
| `POST /api/negotiations/{id}/accept` | Accept an offer manually |
| `POST /api/negotiations/{id}/reply/upload` | Hand over a hospital reply. `reply_type=revised_bill` for a revised bill |
| `POST /api/negotiations/{id}/pay/completion` | The web app confirms the completion payment |
| `GET /api/negotiations/{id}/revised-bill` | Revised bill text. 402 until paid |
| `GET /api/negotiations/{id}/revised-bill/pdf` | Revised bill PDF. 402 until paid |

Status flow after a settlement: `HOSPITAL_ACCEPTED` → `SETTLEMENT_AGREED` → `AWAITING_COMPLETION_FEE` → `COMPLETED`. `HELD_FOR_REVIEW` means autopilot is waiting for a person (only when `AUTOPILOT_HOLD_FOR_REVIEW=1`).

## 4b. Hospital contact lookup

`src/lib/ai-service.ts` has a `findProviderContact` stub that calls an `ai-service` endpoint that does not exist yet. The engine now answers that question, and `src/lib/automation-engine.ts` exports a function with the same name and call shape. To switch, in `src/app/api/dashboard/bills/[id]/find-contact/route.ts` (and its test) import from the engine client instead:

```ts
import { findProviderContact, getAutomationEngineConfig } from "@/lib/automation-engine";
// ...
if (!getAutomationEngineConfig()) { /* same 503 response as before */ }
```

What to expect:

- **Most hospitals publish no billing email.** The lookup returns `billing_email: null` for them, plus a phone number, a billing page, and a `notes` string. Show the notes to the customer so they know to type the address in. The route's existing "please type it in" path already covers `null`.
- **It never guesses.** A hospital that is not in the directory comes back empty with `verification_status: "unverified"`.
- **Matching is strict.** It needs a whole-phrase match on the hospital's name, and when the customer gave an address, the hospital's state has to appear in it. A hospital with a similar name in another state does not match.

The directory is `engine/provider_directory.json`: 16 systems, 3 with a billing email. Each entry was traced to the hospital's own pages and carries its source URLs and the date it was checked (`checked_on`). Rules for growing it:

- Add an entry only with a source URL for every contact. Use `null` for anything the hospital does not publish. Never fill in a likely-looking address.
- Use `verification_status: "verified"` when the hospital's official page lists the contact, and `"listed"` when it comes from a brochure or a secondary source.
- Use multi-word keywords and set `states`, so a similar name elsewhere does not match.
- `tests/test_contact_finder.py` checks every entry for sources, valid emails and keyword rules.
- Hospitals change their contacts. Re-check entries on a schedule before relying on them, or replace the file with a maintained data source. A short list of large systems cannot cover most bills.

## 5. Overlap with `services/ai-service`

`services/ai-service` also has negotiation code (`app/negotiation/`: cadence, dispatcher, reply classifier) and pricing code (`app/pricing/`). These were not compared line by line. The simplest split is:

- `ai-service`: document ingestion, OCR, and extraction.
- `automation-engine`: audit rules, the negotiation, the revised bill, fees, and the hospital contact lookup.

If you would rather have one service, port the pieces of the engine you want into `ai-service`. They are separate modules in `engine/`.

## 6. Security

- Set `ENGINE_API_KEY` in production. Without it the API is open.
- Keep the API key on the server. Never put it in `NEXT_PUBLIC_` variables.
- Set `ENGINE_CORS_ORIGINS` to your own origins, or leave browsers out entirely.
- `POST /api/negotiations/{id}/pay/completion` unlocks the bill for whoever calls it. Only call it from a verified Stripe webhook.
- `ENABLE_DEMO_UI=0` in production.

## 7. Open decisions

- **Fee amounts.** The commitment fee ($20) and completion rate (10% of savings, rounded up to the next dollar) are placeholders to confirm with the business. Savings means original billed charges minus the accepted amount.
- **Review hold.** With `AUTOPILOT_HOLD_FOR_REVIEW=0` (the default) the engine sends everything automatically and includes every finding in the letter. With `1` it sends only high-confidence findings and holds sends while any finding needs review. Decide which you want in production.
- **Settlement amount.** When the hospital accepts, the engine settles at the offer on record, not the figure the hospital states in its reply. If they differ, the engine will not notice. Decide which figure governs.
- **Benchmarks and citations.** The rates in `engine/benchmarks.json` are unverified and must be checked against CMS data. The citations in `engine/audit_engine.py` (`CITATIONS`) need legal review.

## 8. Known limits

- The inbox check logs in to the mailbox on every poll. Fine for a demo, heavy for production. A push notification (inbound webhook at `/api/webhooks/inbound-email`) is the better route.
- A revised bill that arrives as plain email text, with no PDF, is not checked for the agreed amount.
- Scanned PDFs are read by the vision model. That path has not been tested against real scans.
- The contact directory is small (16 systems) and was checked on one date. See section 4b.
- The Dockerfile was written but not built in the environment this was prepared in.
