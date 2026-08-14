# Frontend Conventions

## Stack

- Next.js (App Router), TypeScript, Tailwind v4. No component library —
  everything is hand-built with Tailwind utility classes.
- Fonts: Poppins (sans, default) and Playfair Display (serif, used for
  dashboard/admin page headings) — see `src/app/layout.tsx`.
- Design tokens live in `src/app/globals.css` under `@theme inline`
  (`primary-*`, `accent-*`, `cream-*`, `danger`/`warning`/`success`). These
  predate the Figma-verified values in `docs/DESIGN-SYSTEM.md` — when the
  two disagree, the Figma-verified value wins for that specific screen; use
  an arbitrary Tailwind value (`bg-[#0f7545]`) rather than silently
  "fixing" the global token, since the global token is shared across
  screens that haven't been re-verified yet.

## Directory layout

- `src/app/(landing)` via `src/app/page.tsx` — marketing/landing page,
  sections under `src/components/landing/`
- `src/app/dashboard/**` — end-user dashboard, shell in
  `src/components/dashboard/DashboardShell.tsx` + `Sidebar.tsx`
- `src/app/admin/**` — admin dashboard, shell in
  `src/components/admin/AdminShell.tsx` + `AdminSidebar.tsx`
- `src/components/Logo.tsx` — shared logo, real asset-based (not hand-drawn
  SVG). Green version (`public/logo-icon-green.png`) for light backgrounds,
  white version (`public/logo-icon-white.png`) for dark backgrounds. Both
  were provided directly by the user and background-removed with Python/
  Pillow flood-fill — **do not regenerate or approximate these with hand-
  drawn SVGs**, that was tried and explicitly rejected.

## No backend yet

Every page uses mock/local data and client-side `useState` to fake flow
transitions (upload → scan → negotiate, payment forms, etc). This is
intentional and current — see the user's memory: full-stack build is
frontend-first, backend is a separate later phase, and AI/ML (OCR, error
detection, negotiation generation) is entirely out of this engagement's
scope, always treated as an external service boundary.

## Verifying a change (do this, every time, before saying it's done)

This project cannot be viewed in a normal browser preview by either party in
real time during the session — verification is screenshot-based:

1. `npm run build` in the project root — must pass clean before testing.
2. Ensure the dev server is up: check `curl -sf http://localhost:3000`, and
   if not, restart it in the background:
   ```
   lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
   npm run dev > /tmp/nextdev.log 2>&1 &
   timeout 40 bash -c 'until curl -sf http://localhost:3000 >/dev/null; do sleep 1; done'
   ```
3. Screenshot with the Playwright script pattern already in the scratchpad
   (`screenshot.mjs`, `screenshot_footer.mjs`, `walk_*.mjs` for multi-step
   flows) — launch chromium, `page.goto`, `page.screenshot`. For
   interactive flows (modals, multi-stage state), script the clicks with
   Playwright rather than asking the user to click through manually.
4. **Read the screenshot back and actually look at it** before claiming the
   change is correct. Compare side-by-side against the reference (Figma
   screenshot or user-provided image) at the pixel/proportion level, not
   just "does it roughly look plausible."
5. Clear `.next/cache/images` and hard-restart the dev server after
   swapping any image asset — Next's image optimizer caches transformed
   images and will keep serving the old one otherwise (bit us once with the
   logo swap).

## Things that have gone wrong before — don't repeat

- **Guessing a screen from memory instead of re-checking the source.** See
  `docs/FIGMA-WORKFLOW.md` — this was the single biggest source of wasted
  cycles in this project so far.
- **Hand-drawing SVG icons instead of using the real asset.** Every icon
  Figma exposes via `get_design_context` is a real downloadable asset;
  download and commit it (`public/icons/`), don't approximate it by eye.
- **Background-removal on user-provided PNGs**: if a background needs
  removing, use the Python/Pillow flood-fill approach (sample corner color,
  flood-fill from border, feather the edge, optionally erode a few px to
  kill anti-aliased fringe) — this is scripted ad hoc each time in the
  scratchpad; consider promoting it to a reusable script if it comes up
  again.
- **Double-wrapping backgrounds/gradients.** Check whether a parent
  component already paints a background before adding another one in a
  child (see the `FlowCard` nesting bug in `docs/DESIGN-SYSTEM.md`).
- **Assuming a fix is "spacing" when it's structural.** When two sibling
  columns have inherently different content heights (e.g. 5 social icons
  vs. 4 nav links), no amount of `gap-*` tuning fixes visual imbalance —
  use `items-center` / `justify-center`/`justify-between` on the right
  flex axis instead of guessing padding values.
