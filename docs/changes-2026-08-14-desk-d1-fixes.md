# Dash — Desk D1, first-deploy fixes

**Date:** August 14, 2026
**What this is:** the six things you found on the first deploy. Desktop only, as you scoped it — nothing here touches the phone.

## What to upload

- `js` — `views/desk.js` changed
- `css` — `app.css` changed
- `docs` — this note and the two updated docs
- `sw.js` — **on its own**, bumped to `dash-v32`

No data-format change this time, so no "update everything first" ritual. A hard reload on the Mac is enough.

---

## The blocker: drawers didn't open

They *were* opening — a full window-height below the bottom of the screen.

The drawer panel is positioned relative to the row of handles it hangs from. I appended it to the page as a sibling instead of leaving it inside that row, so "sit just under my handle" was measured against the whole page rather than against the handle. It opened off the bottom of the world.

One line. Fixed, and the render test now checks that the drawer is still attached to the handle row — which is the kind of thing the test *can* see.

**Why the tests missed it:** the render tests run in a fake browser that has no layout engine at all. It knows what elements exist and how they nest; it has no idea where anything is on screen, how big it is, or whether it's visible. So "the drawer's contents mounted" passed while "the drawer is somewhere you can see" was never asked. I've written that into the current-state doc as a standing rule: headless tests check structure and data, never geometry. Geometry is checked by looking.

## The desk is now the window

It shipped as a framed box with scrollbars — the browser's default when you set up a scroll region and stop there. That isn't the model we settled on.

- **Edge to edge.** Banner, handles and surface now span the full window, like the List and Board header bars.
- **The desk fills whatever height is left** under the banner, measured rather than guessed, and re-measured when you resize the window.
- **No scrollbars.** Drag any empty part of the desk to pan it. The trackpad still scrolls if you'd rather — it's just not advertised with a bar down the side.
- **Hold `Z` or the ✧** still fits the whole desk in view.

One thing worth knowing: with an empty desk there's almost nothing to see when you pan or glance — the surface is bare. Both will read properly once you've got cards out. Open **Unplaced**, drag a couple onto the desk, then try them.

## Visual

- **More air between the title's rule and the facts line.** The progress fraction is deliberately set large with no line height of its own, so its glyphs overflow into the padding around them — there wasn't enough of it and the number was touching the rule.
- **The banner buttons recede.** They were cream boxes on your blue, which is exactly backwards for banner controls. `app.css` had the right rules already but had scoped them to the *old* banner's class, so the new one never got them. Widened, as the addendum said to. The `＋ Entry` button no longer inverts to a solid block either — on this banner that was the loudest thing on the page. All five now draw in the banner's own ink, which is the pair the token system already measured for contrast, so they stay legible on any project colour including a custom one.

---

## Still true

63 checks still pass, plus one new one for the drawer. Nothing about the data changed.
