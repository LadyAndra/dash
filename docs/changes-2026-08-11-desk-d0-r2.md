# Dash — the Desk, Phase D0 round 2

**Date:** August 11, 2026
**What this is:** the mockup rebuilt from your round-1 feedback. Same file, `mockups/desk-preview.html` — open it the same way. **Still nothing deployed, no `sw.js` change, no cache bump.**

Your decisions are now written into `dash-desk-addendum.md` as a new **§14**, including the three that supersede earlier ones, so a future session can't accidentally build the old version.

---

## Both bugs — found, and worth knowing why

**Double-click did nothing.** My fault, and a specific one: the code called `preventDefault()` the moment you pressed the mouse down, and that quietly switches off the browser's own click and double-click events. So the double-click never existed to be listened for. It now recognises the second click itself, which as a bonus will behave the same later on an iPad stylus.

**The drawer opened and shut with no slide, whatever the speed slider said.** This one wasn't a bug — it was **Reduce Motion being on in macOS**. Dash correctly strips every animation when that setting is on, and so did the mockup, so there was nothing to judge and no way to tell that's what happened.

I've left that behaviour exactly as it is, because it's an accessibility floor and I'd rather not weaken it. What I've added is a red notice in the tuning panel that appears when Reduce Motion is on, with a tick-box: **"Show me the motion anyway"**. That's preview-only — the real app will always obey your system setting. Tick it and you can judge drawer speed, settle and glance properly.

If you'd rather leave Reduce Motion on and never see desk animation, that's a completely legitimate answer too — say so and D1 ships with motion off as the default rather than as a fallback.

---

## What's new to look at

**The desk mat.** The background is now a big, curved field-line pattern — your fourth reference, turned into landscape. It isn't an image: it's drawn from the actual mathematics of a cylinder in a uniform field (the same equations behind that Maxwell plate), so it's a few dozen lines of geometry, it re-themes with everything else, and it costs nothing to ship. It starts at 3% ink, which is exactly the body dot-grain in `app.css`. Two sliders: **presence** (how visible) and **scale** (how big the eye of the pattern is). Push presence up to 8% or so to see it clearly, then bring it back down to where it should live.

**Panning.** Drag any empty part of the desk and it moves under you. The desk is now bigger than the frame on purpose, so there's something to pan. Cards also can't get stranded any more — the old bug was that a card shoved past the edge kept its off-desk position and only *looked* pinned to the boundary, so the first part of dragging it back did nothing. Positions are now clamped where they're stored, not just where they're drawn.

**Glance.** Hold **Z**, or press and hold the **Hold to glance** button in the banner (there's one in the grey bar too). The whole desk shrinks to fit; let go and you're back precisely where you were. Nothing is remembered, nothing stays on screen, and you can't move anything while holding. **I need you to pick one trigger** — the key, the button, or both.

**Peek as three drawers.** Three handles along the bottom edge of the banner, wearing the project's colour. Open one, it takes only the room its contents need, the other two stay shut. Click the open one again to close it, or press Escape.

**Double-click a card** and it grows in place into the full entry — not a modal, the desk stays around it. It sits straight while it's open, since reading a tilted card is annoying. Double-click again, press Escape, or use the Collapse button to put it back.

**Cards size themselves** between 260 and 300px now rather than all being one width, with both ends on sliders.

Rotation starts at ±2°, anatomy at C, pile weight at edges — your three locked answers are the defaults, not just options.

---

## What I still need from you

1. **Looseness** — you held this open for the mat. It's there to judge now.
2. **The mat: presence and scale.** Also worth saying if the pattern itself is wrong — I can change what the field looks like (two poles instead of one, a different orientation) without changing anything else.
3. **Glance trigger:** key, button, or both.
4. **Drawer speed, settle, glance speed** — needs the motion tick-box first if Reduce Motion is on.
5. **Does `⤢` earn its corner?** Double-click is your call and it's in. The little corner button does the same thing and is the only visible hint that expanding exists. Keep it, drop it, or keep it only until you're used to the gesture.

Copy the box in the tuning panel and paste it back, plus anything the box doesn't cover.

---

## Notes for D1

- **§14 of the addendum is now the spec** for everything in this round. Decisions 13 and 14 (one drawer, stacked shelves) are superseded by §14.4; decision 28 is narrowed by §14.2 and §14.3.
- The desk becomes **its own scroll region** rather than page-scrolling, so "the frame" is a definite thing to pan inside and to fit the glance to. That's a refinement of §5.1, not a reversal — worth calling out in the D1 note.
- The mat is **generated, not an asset**: `W = z + a²/z`, inverted along straight lines in `W`, taking the root outside the cylinder. One trap, already hit and fixed: on the cylinder boundary both roots have the same modulus and floating point flips between them, which draws chords straight across the disc. Drop those samples; stroke the circle separately.
- The glance is implemented as a transform on the surface plus saved-and-restored scroll offsets, so "exactly back where it was" is free and there is **no zoom state anywhere**. Keep it that way.
- Nothing was added to `SHELL`; `CACHE_VERSION` stays `dash-v30`.
- `dash-current-state.md` is still untouched — there's no shipped behaviour yet. D1 updates it.
