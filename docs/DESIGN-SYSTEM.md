# Design System — Confirmed Tokens

Values in this file are **confirmed from Figma** (via `get_design_context`),
not guessed. When a value is marked "guessed/approximated", treat it as
unverified and pull the real node before trusting it further. Prefer this
file over the Tailwind tokens in `globals.css` where they conflict — the
`globals.css` tokens (`primary-600` etc.) were set up early, before this
project started pulling exact values from Figma, and are close-but-not-exact
(e.g. `primary-600 #146138` vs. the real brand green `#0f7545`).

## Colors (confirmed)

| Token | Hex / value | Used for |
|---|---|---|
| Brand green | `#0f7545` | Buttons, active nav text, active nav bar, icons |
| Heading ink | `#003322` (3-digit hex `#032` expanded) | Card headings (dark, near-black-green) |
| Muted subtext | `#a6b1bb` | Card subtext/descriptions |
| Nav inactive text | `#4d6276` | Sidebar inactive links |
| Nav active background | `#ebebeb` | Sidebar active item background (plain light gray — **not** a tinted green) |
| Progress track | `#d9d9d9` | Progress bar background |
| Progress fill (amber) | `#ebb55d` | "File Uploading" progress bar fill |
| Success green (checkmark) | `#4bd37b` circle, white check | "File Uploaded successfully" icon — real asset at `public/icons/check-success.svg`, not hand-drawn |
| Card border | `rgba(164,164,164,0.1)` | 1px border on white cards |
| Card shadow | `0px 4px 4px 0px rgba(0,0,0,0.25)` (approximated to `0.1` alpha in code so far — recheck if it reads too heavy) | White cards |
| Content area gradient | `linear-gradient(9.256deg, rgb(244,255,250) 19.69%, rgb(255,250,242) 86.795%)` = `#F4FFFA` → `#FFFAF2`, ~9° diagonal | Dashboard main content background |

## Typography

- Figma's real font family is **`TT Firs Neue Trl`** (custom/paid font,
  weights: Light, Regular, Medium, DemiBold), used site-wide in the
  dashboard designs pulled so far.
- This project currently uses **Poppins** as the working substitute (no
  access to the real font file). This is a known, accepted gap — flag it if
  the user provides the actual font files, but don't silently keep guessing
  other fonts.

## Component patterns (confirmed)

### Dashboard upload flow (Choose a file → File Uploading → File Uploaded → Ready for scan)

**Correction (2026-08-11): this overrides an earlier version of this doc.**
Figma node `283:1989` and siblings (`283:19xx`–`283:20xx`) show a plain
single white card with no banner/stats/dashed border, and were initially
treated as authoritative. The user rejected that rebuild twice, on the same
pasted reference image both times, and confirmed the actual target is:

- `WelcomeBanner` (dark green gradient, glossy checkmark icon, "Welcome" +
  subtitle) always visible at the top of `/dashboard`, on every stage of
  the upload flow, not just the data-bearing "negotiating"/"scanning"
  stages.
- `DashboardStats` (4 cards: Bill Analyzed / Savings Found / Errors
  Detected / Appeal Generated) always visible beneath the banner, same
  condition.
- Step content (Choose a file / File Uploading / File Uploaded
  successfully / Ready for scan) lives inside a **dashed-border box**
  (`border-2 border-dashed border-gray-200`, `rounded-2xl`, white
  background, `min-h-[620px]`, centered content) — **not** the solid
  shadowed `rounded-[50px]` card that node `283:1989` shows.
- Headings in this flow use the shorter copy from the pasted reference
  ("Ready for scan", not "Your Medical Bill is ready for scan"), text-3xl,
  color `#003322`.

**Takeaway for future screens**: a matching Figma node is strong evidence
but not automatically final — if the user repeats the same correction
against the same reference more than once, that pasted reference wins over
a Figma node that superficially matches (same nav labels, same screen
name) but disagrees on structure. Figma files in this project mix multiple
unreconciled iterations (see `docs/FIGMA-WORKFLOW.md`); node `283:1989` was
apparently one of them despite carrying the "current" nav labels.

`FlowCard.tsx` (the solid `rounded-[50px]` card component) is still used
as-is for the **scanning-in-progress** state ("We're scanning your Medical
Bill") and hasn't been contradicted — leave it there unless the user flags
it too. Don't add a gradient background inside `FlowCard` itself —
`DashboardShell` already paints the gradient content area behind it;
wrapping it twice produces a visible double-card nesting bug (this
happened once already).

### Sidebar

- Active nav: green text `#0f7545`, background `#ebebeb`, thick (`18px`)
  green bar on the left edge — current code approximates this with a 4px
  border; revisit if the user flags it.
- Inactive nav: `#4d6276`, `font-light`.
- Nav icons: a 3-path "book/bookmark" glyph, consistent across all nav
  items (not per-item distinct icons).

## Screens verified against Figma so far

- ✅ Dashboard upload flow (Choose a file → File Uploading → File Uploaded
  → Ready for scan → We're scanning) — see `src/app/dashboard/page.tsx`.
  Matches the user's repeatedly-confirmed pasted reference (banner + stats
  + dashed box), **not** Figma node `283:1989` — see the correction note
  above before "fixing" this back to the Figma node.
- ✅ "Analysis Complete – Errors Found" detail page — matches node
  `337:3556`, see `src/app/dashboard/documents/[id]/page.tsx`
- ⚠️ Everything else (footer, admin dashboard, landing page sections,
  Active Case, Settings, Support) was built from **pasted screenshots**,
  not a direct Figma pull. They may still be accurate, but they have not
  been cross-checked against live Figma nodes the way the dashboard flow
  now has been. If the user flags one of these as wrong, pull it from
  Figma first — don't assume the screenshot-based build was already
  correct.
