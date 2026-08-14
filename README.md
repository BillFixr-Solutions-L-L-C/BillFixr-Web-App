# BillFixr

BillFixr is an AI-powered platform that reviews medical bills for billing
errors and overcharges, then negotiates reductions on the patient's behalf.

This repository contains the web application: the marketing site, the
authenticated user dashboard, and the internal admin dashboard.

## Status

Frontend-first build. All screens currently run on mock/local data — there
is no backend integration yet, and bill scanning / error detection / letter
generation are handled by a separate AI/ML workstream that this app will
integrate with as an external service once it's ready.

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- Tailwind CSS v4
- No component library — UI is hand-built with Tailwind utilities

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

## Project structure

- `src/app/(landing)` via `src/app/page.tsx` — marketing/landing page
- `src/app/dashboard/**` — end-user dashboard
- `src/app/admin/**` — internal admin dashboard
- `src/app/careers/**`, `src/app/testimonial` — public careers listings and
  the logged-in testimonial flow
- `src/components/` — shared UI, grouped by area (`landing/`, `dashboard/`,
  `admin/`)

## Conventions & design source

Before making UI changes, see `docs/`:

- `docs/FIGMA-WORKFLOW.md` — how to pull screens from the Figma source of
  truth
- `docs/DESIGN-SYSTEM.md` — confirmed colors, typography, and component
  patterns
- `docs/FRONTEND-CONVENTIONS.md` — stack conventions and the verification
  checklist to run before calling a UI change done

## License

Proprietary — © 2026 BillFixr Solutions, LLC. All rights reserved.
