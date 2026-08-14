# BillFixr — PRD Summary & Build Context

Source: `BillFixr PRD.docx` (Engineering Delivery Pack)

> **Scope note:** This engagement covers the full-stack application (frontend, backend, infra, integrations) only. The AI/ML layer — OCR extraction, error detection, negotiation-document generation, document comparison — is a separate workstream and is treated here as an external service consumed via API, not something to be built as part of this scope.

## 1. What It Is
BillFixr is an AI-powered platform that automatically reduces inflated or erroneous medical bills. Users upload a bill; the system OCR-extracts it, detects billing errors, generates negotiation documents, and communicates with the hospital on the user's behalf — with minimal human intervention.

**End goal:** a fully autonomous negotiation engine that reliably delivers savings.

## 2. Problem It Solves
US medical bills are complex and error-prone: duplicate charges, wrong CPT/HCPCS codes, inflated facility fees, out-of-network misclassification, insurance mismatches. Patients lack expertise/leverage to dispute; hospital billing depts are structured to resist. BillFixr automates detection, evidence-based negotiation, persistent follow-up, and (if the hospital stonewalls) legal-ready documentation.

## 3. Goals
**Functional:** AI error detection → negotiation letters/evidence packets → multi-channel hospital contact (email/fax/portal) → persistent follow-up → revised bill capture → savings/fee calculation → full user transparency.

**Non-functional:** high OCR/error-detection accuracy, fast turnaround, HIPAA-aligned security, scale to thousands of concurrent cases, deterministic state-machine reliability, simple/transparent UX.

## 4. Target Users
Non-technical Americans with high or disputed medical bills who can't negotiate with hospitals themselves. UI must be simple; backend must handle complex billing logic.

## 5. Core Features

### User-Facing
- **Bill Upload**: PDF/JPG/PNG, validated for type/size/readability, confirmation shown.
- **Dashboard**: case status, action timeline, savings breakdown, documents (watermarked pre-payment), notifications.
- **Notifications** (email + dashboard): bill received, analysis complete, errors found/not found, negotiation sent, follow-ups, hospital response, revised bill, payment request, case closed, legal escalation.
- **Payment**: success fee (e.g. 20% of savings) via Stripe-like gateway; unlocks full unwatermarked documents.

### AI/ML
- **OCR Extraction**: line items, codes, charges, dates; confidence scores; flags unreadable docs.
- **Error Detection**: CPT/HCPCS validation, duplicate charges, inflated charges, insurance mismatch, out-of-network misclassification, missing/inconsistent data.
- **Negotiation Document Generation**: error summary, evidence references, corrective requests, structured letters, follow-up letters.
- **Document Comparison**: original vs. revised bill, confirms corrections, flags remaining discrepancies, calculates savings.
- **Hospital Contact Discovery**: extract from bill; if missing, AI searches for correct billing dept contact.

### Automation
- **Hospital Communication**: send negotiation packet via email, fax, or portal.
- **Follow-Up Automation**: escalating follow-ups at day 3, day 7, day 21; if still silent → mark non-responsive, notify user, issue legal escalation docs.
- **Case Status Engine**: auto-transitions through defined states (see §6).
- **Savings Calculation**: original amount, revised amount, total savings, success fee.
- **Document Watermarking**: applied until payment, then removed.

## 6. Full Case Lifecycle (State Machine)
1. **Upload** → validated → "We've received your bill. Analysis has started."
2. **AI Analysis** (OCR + error detection)
   - No errors → notify user, close case, **no fee charged**.
   - Errors found → generate negotiation packet → proceed.
3. **Hospital Communication** → extract/discover contact → send letter → notify user.
4. **Follow-Ups** → day 3 / 7 / 21 if silent → still silent → notify user, advise legal escalation, all docs downloadable.
5. **Hospital Response** (if accepted) → await revised bill, watermarked docs available.
6. **Revised Bill Received** → compare original vs. revised → calculate savings → request payment → docs stay watermarked.
7. **Payment** → success fee paid → watermark removed → full docs unlocked → case closed.

Case statuses: Uploaded, Analysis in progress, No errors found, Errors detected, Negotiation sent, Awaiting hospital response, Follow-ups sent, Hospital responded, Revised bill received, Payment required, Case closed, Legal escalation advised.

## 7. Technical Architecture
- **Frontend**: React / Next.js
- **Backend**: Node.js + Python
- **AI Layer**: OCR + NLP + billing logic
- **Database**: PostgreSQL
- **Storage**: AWS S3
- **Automation**: Email API, Fax API, Scheduler
- **Security**: HIPAA-aligned

**Required services**: OCR, error detection, negotiation generation, hospital communication, follow-up scheduler, case status engine, notifications, payment, document watermarking.

**Core data models**: User, Bill, Error, NegotiationPacket, HospitalContact, CommunicationLog, RevisedBill, PaymentRecord, Case.

## 8. Edge Cases to Handle
- Unreadable bill → request re-upload
- Wrong file type → reject + notify
- Duplicate bill → merge
- No errors → close case (free)
- Partial corrections → partial savings
- Payment failure → retry
- Hospital non-responsive → legal escalation

## 9. KPIs
- **AI/ML**: OCR accuracy, error detection precision/recall, negotiation acceptance rate, document comparison accuracy.
- **Automation**: post-follow-up response rate, time-to-revised-bill, workflow completion rate.
- **UI**: upload-to-completion conversion, payment completion rate, user satisfaction.

## 10. Legal Clause
If errors are detected but the hospital doesn't respond within 21 days: user is advised to pursue legal action, all documents are released for download, and **no success fee is charged**. Must be reflected in Terms & Conditions, consent flow, and system messaging.

## Notes for Implementation
- Business model is contingency-fee (success fee % of savings) — payment/fee logic and "no fee if no savings" must be enforced consistently across dashboard, notifications, and legal copy.
- Document access control (watermark vs. unlocked) is payment-gated and needs to be enforced at the storage/serving layer, not just UI.
- The 3/7/21-day follow-up cadence and 21-day non-response threshold are hardcoded business rules likely worth centralizing in the scheduler/case-status engine config.
- **Two-fee model (confirmed from Figma, not in original PRD text)**: a small upfront **$5 commitment fee** is charged before AI analysis begins, separate from the existing **success fee** (~20% of savings) charged after negotiation/revised bill. Both payment flows must be built.

## 11. Design Decisions (from Figma review, confirmed 2026-08-07)
- **Brand color**: Green is the primary UI color (logo, nav, sidebar active states, most buttons). Orange/amber is an intentional accent reserved for high-emphasis hero/CTA buttons (e.g. "Upload Your Bill" on the landing hero).
- **Admin dashboard IA**: the Figma file contained two competing admin nav structures. The **text-label sidebar** version is the one to build: `Dashboard / Users / Payments / Uploads / Support / Settings`, with a topbar (date, search, notifications, admin profile). It covers: Dashboard (stats + revenue chart + case table), Users/Customers (list, detail w/ suspend/delete, generated docs: Original Bill, Adjusted Bill, AI Generated Letter, Provider Letter), Uploads (log + detail modal), Payments (Commitment Fee vs. Percentage Fee transaction tables), Support (ticket list + detail), Settings (Manage Admin, Profile Settings).
  - The icon-only variant (Admin Dashboard / Case Detail / Automation Monitoring / User Management) was **not** selected but had useful detail (OCR/AI risk assessment panel, manual override & approval chain, automation monitoring/logs) that may be worth revisiting later if deeper ops tooling is needed.
- **Copy note**: brand name is "BillFixr" (not "BillFix" — a typo appeared in some frames).

## 12. Screens Inventory (from Figma exports)
**Landing page**: hero, "Before you pay, let BillFixr read it" section, 404 page.

**User dashboard**: Sign up / Get Started, Upload flow (choose file → T&Cs → scan), My Documents (table), Active Case (files, stats, provider response states, negotiation letter viewer + Summarize Reply + Download PDF), two payment flows (commitment fee, success fee), Settings (Edit Profile / Security), Support (ticket form + live chat widget), Log out confirmation.

**Admin dashboard**: Dashboard (stats, revenue chart, case table), Users/Customers (list + detail), Uploads, Payments (two fee types), Support tickets, Settings (Manage Admin / Profile).
