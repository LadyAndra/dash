# Dash — the Desk, Phase D0 round 3

**Date:** August 11, 2026
**What this is:** your round-2 numbers locked in, the three bugs fixed, and the desk made big enough to think on. Same file, `mockups/desk-preview.html`. **Still nothing deployed, no `sw.js` change, no cache bump.**

All of it is recorded in `dash-desk-addendum.md` §14.7–§14.11, including your two deferred items so nobody touches them.

---

## Your numbers are now the defaults

Rotation ±2°, looseness 0.80, mat 7.5% at scale 5, cards 260–410, expanded 460, edges, anatomy C, drawer 380ms, settle 160ms, glance 380ms. The sliders are still there so you can re-check them against the bigger desk, but the file opens on your answers, not on mine.

The `⤢` corner button is gone. Double-click is the whole gesture. (The **Collapse** button inside an expanded card stays — once a card is open it needs a visible way out.)

The glance button in the banner is now a small **✧** rather than a labelled button. One thing to watch: **★ is already spoken for** as one of the four wonder symbols, so the glance mark shouldn't end up being a star that reads like one of those. ✧ is a placeholder for whatever you land on when you do the glyph pass.

---

## The three bugs

**The drawer opened full width.** You were right that this didn't match what I described. It now opens as a column under its own handle, at that handle's width — one drawer in a run of drawers. Two things fell out of fixing it: it needs a minimum width (a third of the banner is too narrow to read a Filed list in, so it won't go below 360px), and because it's narrower than the page it now slides *over* the desk instead of pushing it down — pushing would open a strip of empty page beside it.

**The close cut instead of sliding.** The contents were being thrown away in the same instant the height went to zero, so there was nothing left to animate. Open and close now take the same 380ms, and both still vanish entirely if Reduce Motion is on and the override is off.

**The symbols were stuck.** Straight bug against §5.5, as you said. Both now move freely: drag either one onto a card and it pins there — at the exact spot you drop it — and rides that card everywhere afterwards; drag it off onto open desk and it lets go and sits where you put it. The card you're about to attach to darkens its edge so you can see where it will land. Dropping a pinned symbol back on its own card just moves it to a new spot on that card.

---

## The desk is much bigger

**4400 × 2900** now, up from 2200 × 1400. The reasoning: at your locked card size and looseness a card takes up about 330 × 190 including breathing room, so 100 of them want roughly 6.3 million square pixels. The new desk is a little over 12.7 million — about twice that, which is the difference between "they all fit" and "there's still somewhere to put things down."

**There's a "Fill to 100 entries" button** in the tuning panel so you can see it rather than take my word for it. Fill it, pan around, then hold the glance. That's the honest test of whether the size is right, and it's the thing I'd most like your reaction to. If it feels wrong in either direction, the number is one constant.

Everything else got re-spread across the new space, so the desk no longer opens with everything crammed into one corner.

---

## Your two deferred items — recorded, untouched

- **The banner's height on the desk view.** Nothing changed. Written into the addendum as "to be discussed before anything changes," with a note that whatever we decide has to either keep "the banner stays exactly as built" true or explicitly replace it.
- **The wonder symbol glyphs.** Flagged for a later design pass. Not now.

And yes — **un-placing a card back to the tray is D1 scope** and still on the list, as `vs set removed` with restore, per the never-delete rule.

---

## What I'd like back

Mostly one thing this time: **fill it to 100 and tell me whether the desk is the right size.** Everything else is locked unless something looks wrong against the bigger surface — particularly looseness, which you set before the desk grew.

Then D0 is done and D1 can start.

---

## Notes for D1

- **§14.7 is the constants table.** Copy it into `js/desk.js` and `css/app.css` rather than re-deriving anything from this mockup.
- **One motion helper, not two.** The close-animation bug came from the JS and the CSS disagreeing about whether motion was happening. D1 needs a single "how long does motion last right now" function that both the transition duration and any unmount timer read from, and it must return 0 under `prefers-reduced-motion`.
- **Symbols carry `attach` + `offset` OR `pos`, never both** (§12.3). The mockup deletes the other field on every transition; D1 does the same with `dk set` ops and lets the absent field mean "not that kind".
- Hit-testing a rotated card uses its axis-aligned box, which is slightly generous. That is the right trade — it only makes attaching easier — but it should be a deliberate line in D1, not an accident.
- Nothing added to `SHELL`; `CACHE_VERSION` stays `dash-v30`. `dash-current-state.md` still untouched until D1 ships.
