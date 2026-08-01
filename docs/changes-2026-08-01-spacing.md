# Spatial parameters — control sizing, column widths, clipped text

**Date:** 1 August 2026
**Cache version:** `dash-v23` → `dash-v24`
**Files:** `css/tokens.css`, `css/app.css`, `js/views/project.js`, `sw.js`

(Drag the `js`, `css` and `docs` folders plus `sw.js`, as always. No new
files this round.)

---

## What was actually wrong

Three separate things, and only one of them was visible as "spacing":

**1. Every control was 44px, everywhere.** That's your own accessibility rule
and it's right — on a phone. On a desktop with a mouse it isn't an
accessibility requirement, and it was costing you 132px of every milestone row
before a single character got drawn. That's *why* "Research Branding" was
clipped to "Research Br".

**2. Your panel columns were optimising for density, not comfort.** The rule
was `minmax(320px, 1fr)` — "fit as many 320px columns as possible." On your
1700px window that made **three cramped ~380px columns** instead of two
comfortable ones. A bigger screen was making things *worse*.

**3. The project page had no width limit at all** while Home was capped at
900px. That was mine, from the rebuild.

---

## What changed

### Controls: 44px on touch, 28px on mouse

Dash now asks what kind of pointer it's being driven by. Your phone is
untouched — every target is still 44px. On the Mac, square controls drop to
28px.

Worth knowing: **text buttons barely move.** A `.btn` is sized by its padding
and label, so 28px doesn't bind — it stays about 33px tall. What actually
shrinks is the square stuff: the milestone tick box, the ↑ ↓ ✕ buttons, icon
buttons. Which is exactly what was looking oversized in your screenshot.

### Columns: fewer and wider

```
YOUR SCREEN, BEFORE          YOUR SCREEN, NOW
┌────┬─────┬─────┬─────┐     ┌────┬──────────┬──────────┐
│rail│ 380 │ 380 │ 380 │     │rail│   522    │   522    │
└────┴─────┴─────┴─────┘     └────┴──────────┴──────────┘
      all three clipped        both comfortable
```

The rule is now "a column is never narrower than comfortable and never wider
than readable." Same rule gives one column on a laptop, two on your desktop,
and a stack on the phone — with nothing device-specific written down.

### The four numbers, in one place

These are the spatial parameters, and they're now tokens in `tokens.css`
rather than scattered through the stylesheet:

| | | |
|---|---|---|
| `--page-max` | 1500px | the widest content ever gets |
| `--panel-min` | 420px | a panel is never narrower |
| `--panel-max` | 660px | …and never wider |
| `--rail-w` | 340px | the fixed left rail |

Want everything roomier? Change `--panel-min`. That's the whole edit.

### Text that was being clipped

I audited it, and it was failing three different ways:

- **A long unbroken word** ("Bowerhaus/Substack") pushing past its box. Titles
  now wrap.
- **A control squeezing a field to nothing** — a flex item's default minimum
  size is its *content*, not zero, so the buttons won every argument. Fixed on
  the milestone label and the hex box.
- **Search pinned to 160px on phones**, which is about four characters of your
  own query. It now takes the row it's in.

The two-line clamp on body previews stays — that one's deliberate.

### Project colour in the projects list

Each project row now wears its own colour as a 6px edge instead of the
hardcoded green every row had. The full list rebuild — progress, next date — is
still to come; this is just the colour carrying through, as you asked.

---

## On draggable columns — why I didn't

You asked whether a dragged width would be remembered. It would: localStorage,
per device, same as your sidebar state. Persistence isn't the hard part.

I'd still steer away from it, and specifically because of what you want next.
**Saved widths go stale whenever the set of panels changes.** Add a weather
widget to Home and your saved layout no longer describes the page, so you'd
re-drag. Add one to a project page, re-drag. That puts "I want more widgets"
and "I don't want to keep adjusting columns" in direct conflict.

The automatic version self-heals. When you add a widget it just finds room,
on every screen size, forever. And if a future widget needs unusual space, it
says so in its own module — `span: 2` for full width — so the decision lives
with the widget rather than in a saved layout that rots.

None of this blocks dragging later. If you try this for a week and still want
handles, the grid is already token-driven and it's an additive change.

---

## Try it, then check on the phone

**Open `mockups/home-panels-preview.html` → "One project".** The milestone rows
in there are now the real markup with the real controls, so you'll see the
28px sizing and the full "Research Branding" label. Drag the window from wide
to narrow and watch it go two columns → one → stacked.

The preview can't show you the 44px touch sizing, because your Mac reports a
trackpad. That one you'll have to check on the phone after uploading.

**What to check once it's live:**

- Desktop: the milestone tick and the ↑ ↓ ✕ buttons should look noticeably
  less chunky, and milestone names shouldn't clip.
- Desktop: a project page should now be two comfortable columns, not three
  cramped ones.
- **Phone: every control should still be finger-sized.** This is the one to
  actually verify — if anything feels small to tap, tell me and I'll pin that
  control back to `--tap-min`.
- Phone: search should be full-width now instead of a stub.

## Still queued

1. **The projects list rebuild** — progress, next date, the colour doing more
   than an edge.
2. **Rolling ground + scale into List / Board / Kanban / Finder.**
