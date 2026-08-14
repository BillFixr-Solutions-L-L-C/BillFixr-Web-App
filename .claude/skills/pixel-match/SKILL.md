---
name: pixel-match
description: Reproduce a screenshot or Figma reference exactly — extract every concrete detail from the source AND read the current implementation's code before touching anything, then close the loop by re-screenshotting and diffing again. Use whenever the user says a screen should match a design "1:1", "exactly", "pixel-perfect", pastes a reference image/Figma link and says something is "wrong" or "different from what I asked", or asks to fix a screen against a design source.
---

# Pixel Match

This project's biggest source of wasted cycles has been guessing at a
design instead of reading it, and editing CSS instead of reading the
component that produces it. This skill is the fix: **extract, don't
guess** on both sides — the reference AND the code.

Two inputs, every time. Never proceed on just one:

1. **The reference** — a Figma node (preferred, via MCP) or a pasted
   screenshot (fallback, when Figma isn't available or doesn't have the
   frame).
2. **The current code** — the actual component file(s) rendering the
   screen right now, read in full, not skimmed or recalled from memory of
   an earlier turn in the conversation.

Skipping step 2 is exactly how the dashboard upload flow went wrong
earlier in this project: the design was rebuilt repeatedly from a mental
model of what the code "probably" did, instead of from what it actually
did. See `docs/FIGMA-WORKFLOW.md` for that incident.

## Step 1 — Extract the reference in full

**If a Figma URL/node is available**, follow `docs/FIGMA-WORKFLOW.md`
exactly: load the `figma-design-to-code` skill, find the right node
(metadata → screenshot to confirm → `get_design_context`), and treat the
`get_design_context` output as the source of truth for:

- **Exact colors** — hex values, not "close enough" token names. If a
  color doesn't match an existing Tailwind token in `globals.css`, use an
  arbitrary value (`bg-[#0f7545]`) rather than rounding to the nearest
  token. Note the mismatch in `docs/DESIGN-SYSTEM.md` if it recurs.
- **Exact typography** — font size, weight, line-height, letter-spacing,
  color, alignment. Figma gives px values; convert deliberately, don't
  eyeball "looks about right."
- **Exact spacing and dimensions** — card widths/heights, padding,
  gaps, border-radius. When Figma gives `rounded-[50px]`, write
  `rounded-[50px]`, not the nearest `rounded-2xl`/`rounded-3xl` token,
  unless a token already matches exactly.
- **Layout structure** — what's actually a flex row vs. a grid vs.
  centered content, and what the alignment/justify rules are. Structural
  mismatches (e.g. one column naturally taller than another) are not
  fixable by nudging padding — see the footer social-icons/links
  incident in `docs/FRONTEND-CONVENTIONS.md`.
- **Real assets** — every icon/image `get_design_context` exposes as an
  asset URL must be downloaded and committed (`public/icons/…`), never
  hand-drawn as an approximate SVG. Asset URLs expire in ~7 days.
- **Exact copy** — headings, body text, button labels, verbatim. Don't
  paraphrase or "improve" wording from a design.
- **Which states/variants exist** — a design file often has more states
  than you've seen pasted screenshots for (e.g. "File Uploading" /
  "File Uploaded successfully" existed in Figma but were missing from the
  build entirely until checked directly). Check sibling frames.

**If only a screenshot is available** (no Figma access, or the frame
genuinely isn't in Figma), extract the same categories by careful visual
inspection — but say explicitly that values are visually estimated, not
pixel-exact, so the user knows the confidence level. Prefer Figma whenever
it's available instead of defaulting to screenshot-guessing out of habit.

## Step 2 — Read the current code in full

Before writing any diff, `Read` every file that renders the target screen
right now — the page component, and every child component it composes
(shell, card, nav, etc.). Do not rely on what you remember writing earlier
in the session; files may have been edited since, by you or by the user
(check for "modified, either by the user or by a linter" notices — those
edits are real and must be read, not assumed).

For each file, note:
- What component/wrapper structure currently exists — is there already a
  gradient/background painted by a parent that a child might double-wrap?
- What values are currently hard-coded vs. pulled from a shared component
  (`FlowCard`, `PageHeading`, design tokens) — changing a shared component
  affects every screen that uses it, so check callers before editing.
- What's genuinely missing (a whole state/branch) vs. present-but-wrong
  (a value to correct).

## Step 3 — Diff before editing

Write out, even briefly in your own reasoning, a concrete list: for each
detail extracted in Step 1, does the code from Step 2 match it? Anything
that doesn't match is either "value is wrong" (edit in place) or
"structure is wrong" (may need a different component shape, not just a
class-name tweak). Distinguishing these up front avoids the loop of
re-guessing spacing values one at a time.

## Step 4 — Implement

- Reuse existing project components/tokens where they already match the
  reference (`docs/FRONTEND-CONVENTIONS.md` has the directory map).
- Only introduce new arbitrary values where the reference genuinely
  differs from what exists — don't refactor unrelated things.
- Download and commit any real asset found in Step 1 rather than
  approximating it.

## Step 5 — Close the loop

Never declare a pixel-match done off the edit alone:

1. `npm run build`.
2. Restart the dev server if needed, screenshot the result with the
   Playwright pattern in `docs/FRONTEND-CONVENTIONS.md`.
3. `Read` the screenshot back and compare it side-by-side against the
   Step 1 reference — same categories: colors, type, spacing, layout,
   assets, copy.
4. If anything is still off, that's a new Step 3 diff — not a fresh guess.

## When the user says "this still doesn't match" after you thought it did

That means Step 1 or Step 2 was incomplete, not that random values need
adjusting. Re-pull the Figma node (don't reuse a stale mental model of it)
and re-read the current code file fresh — something concrete was missed.
Ask the user what specifically looks different only after re-verifying
both sides yourself; don't ask them to do the comparison you should be
doing.
