# BillFixr Frontend — Build TODO

Status as of 2026-08-08. See `PRD-Summary.md` for design decisions and screen inventory.

## Done
- [x] Scaffold Next.js app (TypeScript, Tailwind v4, App Router, ESLint)
- [x] Design tokens: green primary / orange accent palette, Poppins (sans) + Playfair Display (serif) fonts
- [x] Landing page: Navbar, Hero, How it works, Before you pay, CTA banner, Testimonials, FAQ, Footer, 404
- [x] Auth: Sign up, Log in (split layout with brand panel)
- [x] User dashboard: sidebar shell, Welcome/Upload flow (stepper, T&Cs modal, commitment-fee payment), My Documents, Active Case (files/stats/provider-response states/letter viewer/AI summary/pay), Settings (Edit Profile / Security), Support (ticket form + chat widget), Log out
- [x] Admin dashboard: topbar + sidebar shell, Dashboard (stats, revenue chart, status donut, case table), Users (list + detail w/ suspend/delete + 4 generated docs), Uploads (log + detail modal), Payments (overview + Commitment/Percentage full tables), Support (ticket list + detail), Settings (Manage Admins, Profile Settings)

All pages build cleanly (`npm run build`) and have been visually verified via Playwright screenshots against the Figma reference.

## Known Gaps / Follow-ups
- [ ] Real logo icon asset — currently an SVG approximation of the double-checkmark mark. Swap in `public/logo-icon.png` once the user provides the actual file (chat-pasted images aren't accessible as files).
- [ ] Pending landing page revisions from user (not yet specified — awaiting feedback)
- [ ] Everything is currently static/mock data with local component state only — no backend/API wiring yet (explicitly deferred, frontend-first)
- [ ] Mock AI service layer for OCR/error-detection/negotiation-gen (stub, since AI/ML is out of scope for this engagement)
- [ ] Real auth (signup/login forms are UI-only)
- [ ] Real payment gateway integration (commitment fee + success fee forms are UI-only)
- [ ] Icon-only admin nav variant (Case Detail w/ OCR + risk assessment panel, Automation Monitoring w/ workflow/logs, deeper User Management) was not selected but has ops-tooling detail that may be worth adding later

## Later (backend phase)
- [ ] Data models: User, Bill, Error, NegotiationPacket, HospitalContact, CommunicationLog, RevisedBill, PaymentRecord, Case
- [ ] Case status engine (state machine, see PRD-Summary §6)
- [ ] Follow-up scheduler (3/7/21-day cadence)
- [ ] Document watermarking / payment-gated access control
- [ ] Notifications (email + dashboard)
