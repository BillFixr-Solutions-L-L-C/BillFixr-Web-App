# Figma Workflow — Read This Before Building Any Screen

## The rule

**Never build or "polish" a screen from memory, an old screenshot, or a guess.**
Every screen in this project has a real Figma source. If a screen looks wrong,
the fix is to pull the actual node from Figma, not to eyeball proportions and
iterate blindly. Blind iteration is exactly what went wrong with the dashboard
upload flow (see "Known past mistake" below) — many rounds of guessed
adjustments, none of which matched the real design.

## File reference

- Figma file: `https://www.figma.com/design/AI6cqa0ibfYSIRK1ifnWTm/BillFix`
- File key: `AI6cqa0ibfYSIRK1ifnWTm`
- Single page/canvas: `9:50` ("design details") — everything lives on one
  huge canvas at scattered x/y offsets. There is no clean page-per-screen
  structure. Expect to hunt.

## Correct procedure to implement or verify a screen

1. **Load the skill first**: `figma-design-to-code` (via Skill tool) before
   ever calling `get_design_context`. It's a hard requirement, not optional.
2. **Find the right node.** `get_metadata` on `9:50` returns 400k+ characters
   — too large to read directly. Don't call it raw. Instead:
   - It saves to a `tool-results/*.txt` file as a `[{type, text}]` JSON array.
   - Probe it with Python (`jq` is not installed on this machine):
     ```python
     import json, re
     data = json.load(open(path, encoding="utf-8"))
     text = data[0]["text"]
     # list top-level frames:
     re.finditer(r'<frame id="([^"]+)" name="([^"]+)"', text)
     ```
   - `get_metadata` only returns id/type/name/position/size — **no text
     content**. You cannot grep it for visible copy like "Ready for scan".
     You can only grep it for *layer names*, and only if the designer named
     the layer that way (hit or miss).
3. **Screenshot candidates to identify them.** `get_screenshot` on a
   candidate node id, download the PNG via curl, then Read it. This file has
   many frames named identically ("Dashboard" appears 10+ times) at
   different coordinates — visual confirmation is the only reliable way to
   tell them apart.
4. **Once you've found the real node, call `get_design_context` on it** —
   this is the actual source of truth: exact colors, spacing, font sizes,
   copy, and asset URLs. Don't stop at a screenshot and eyeball it; pull the
   code.
5. **Icons and images**: never hand-draw an SVG approximation of an icon
   that `get_design_context` exposes as a real asset. Download the asset
   (`curl -sL -o public/icons/name.svg "<asset_url>"`) and commit it — the
   Figma asset URLs expire in ~7 days, so they must be saved locally, not
   referenced live.

## Known trap: this file has multiple design iterations mixed together

Frames with sidebar nav labeled **"Courses" / "Landing page" / "Files"** are
an **old/WIP exploration** — not the current design, even though they sit
right next to current frames in the same coordinate space. The **current**
nav is confirmed as: `Dashboard / My Document / Active Case / Support`
(confirmed via node `337:3556`, the "Analysis Complete" screen, which also
matches previously-verified pasted reference screenshots).

When you find a frame, **check its sidebar nav labels** before trusting its
content as current. If it says "Courses" or "Landing page", the *content
layout* may still be valid (there was only one frame per flow-state found so
far — no duplicate "current" version existed for the upload-flow states), but
don't assume — screenshot-compare against any previously-confirmed frame
first if one exists.

## Known past mistake (why this doc exists)

The dashboard upload → scan flow ("Choose a file" → "Ready for scan" → etc.)
was built from memory of early pasted screenshots as: green gradient
"Welcome" banner + 4 stat cards + big dashed-border dropzone. That design
does not exist in Figma for those states. The real design is a single
centered white card (`rounded-[50px]`, 699×582px, no banner, no stats) that
repeats across File Uploading / File Uploaded / Ready for scan / We're
scanning — see `docs/DESIGN-SYSTEM.md` for the exact tokens. Several rounds
of "make it bigger", "fix the spacing", "1:1 please" all failed because the
actual fix was never attempted: go look at Figma. Don't repeat this — if the
user says a screen "isn't right" and a reference exists in Figma, pull it
before touching CSS.

## Rate limits

**Correction (2026-08-13): the note this replaces was wrong.** `whoami`
shows both of the user's plans ("John Dansu's team" and "new") are on the
**Starter** tier, not Pro/Org/Enterprise. On Starter, the 200/day Dev/Full
figure does not apply — the real cap is **~20 calls/month total, regardless
of seat** (a Full seat does not raise it; only upgrading the plan tier
does). Hit this limit on 2026-08-13 mid-task (a "carrear"/testimonial page
lookup) after a `get_metadata` call — every read tool (`get_metadata`,
`get_design_context`, `get_screenshot`, `get_variable_defs`, etc.) counts
against it; `whoami` and write tools are exempt.

Budget calls accordingly: confirm the exact node you need before spending a
call on it, batch investigation into as few calls as possible, and expect
to go a full file-exploration session on very few calls before hitting the
wall. When blocked, tell the user plainly rather than retrying — retries
don't reset the monthly window.
