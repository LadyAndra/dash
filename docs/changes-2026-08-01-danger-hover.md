# Change note — the Delete button's hover, and a stale line in Settings

**Date:** August 1, 2026. The **`--ember-soft` contrast fix** (found during cleanup
#6) and **cleanup #8** of the code-health review. **Live at `dash-v29`.**

**Files changed:** `css/app.css`, `js/settings.js`.
**Visible change:** the Delete button's hover is now a faint wash of the accent
instead of a solid pale peach.

---

## The Delete button was failing readability, two different ways

`.btn-danger` — the **Delete** button in the item editor — is ember lettering with an
ember outline, and on hover it filled with `--ember-soft`, a fixed pale peach.

That one fixed colour was broken twice over:

**1. It had no dark-theme value.** Every other colour token in `tokens.css` gets an
override for the mount theme; this one was missed. So on the dark theme you got ember
orange lettering on a pale peach fill:

| Theme | Was | Now |
|---|---|---|
| paper | 4.12:1 *(already under the 4.5 AA floor)* | **4.69:1** |
| dark | **1.91:1** *(near-invisible)* | **5.17:1** |

**2. It didn't follow a custom accent.** When Settings gained the ability to replace
ember with any colour (August 1), that feature updated `--ember`, `--accent-2` and
`--ember-ink` — but nothing updated `--ember-soft`, because it isn't in that list. So
setting a blue accent gave you a **blue Delete button that hovered to peach**. That
one was broken on the light theme too, not only in the dark.

### The fix

The hover is now a 10% wash of `--ember` itself rather than a separate fixed colour.
Both problems disappear by construction: it follows the theme because `--ember` does,
and it follows a custom accent because it *is* the accent.

**Why 10% and not more.** The wash sits *behind* lettering of the same hue, so a
stronger wash costs contrast rather than adding it. Measured against the modal's own
surface: 8% → 4.84:1, **10% → 4.69:1**, 12% → 4.58:1, 14% → 4.43:1 — under the floor.
10% keeps a comfortable margin and is the same weight as every other button hover in
the app, so the Delete button doesn't behave differently from its neighbours.

### What this does NOT fix, and can't

With a custom accent, the Delete button's **resting** state is already governed by
whatever colour you picked — a mid-blue reads 4.98:1 on paper but only 3.04:1 on the
mount, before hover enters into it. That's the standing "your colour is used exactly
as you picked it, and Dash warns rather than correcting" policy, and the colour
picker already reports it under *"as small text"*. The hover no longer makes it
meaningfully worse; the accent choice is what governs.

There is a stronger option if you ever want it: fill the button solidly with the
accent on hover and flip the lettering to `--ember-ink`, the way the project banner's
primary button inverts. That's **contrast-guaranteed for any accent whatsoever**,
because `--ember-ink` is computed to be readable on whatever colour you chose. I
didn't do it because it's a bolder look than what's there now and that's a design
call, not a correctness one. Say the word.

---

## #8 — Settings was describing a view that no longer exists

The Statuses section read: *"Add your own statuses. Each status becomes a Kanban
column."* Kanban was unregistered on August 1, so that sentence pointed at something
you can't get to.

The status registry itself didn't go anywhere — six files still read it. It now says
what's actually true: statuses appear everywhere immediately, **including the quick
status dropdown on every row and card**, which is the thing that replaced Kanban's
one irreplaceable trick.

---

## How it was checked

Against the real `tokens.css` loaded into a real DOM, computing actual WCAG ratios
rather than eyeballing:

- paper hover **4.69:1** and dark hover **5.17:1**, both clear of AA — versus 4.12
  and 1.91 before
- setting a custom accent genuinely moves the hover with it (it stayed peach before)
- the new Settings wording was verified against which files actually read
  `store.statuses()` — six of them, so "everywhere immediately" is accurate

---

## How to try it

1. Upload the **`css` folder** and the **`js` folder**. (`sw.js` is already at
   `dash-v29`.)
2. **Hard-reload once** — Cmd+Shift+R.

- Open any entry and hover **Delete**. It should tint gently in the accent colour and
  the word "Delete" should stay clearly readable.
- Switch to the dark theme and do it again — that's the case that was broken.
- **Settings → Accent colour**, pick a blue, then hover Delete again. It should tint
  blue now, not peach.
- **Settings → Statuses** — the line under it should no longer mention Kanban.

---

## Noted

**`--ember-soft` now has no consumers at all.** It was the only user of that token.
Fold it into cleanup #11 with `--tint-*` (7 tokens) and `--accent-1` / `--accent-3` /
`--accent-4`, which are also referenced nowhere — that's **11 dead colour tokens**
between them, all removable in one pass once you're happy nothing else wants them.
