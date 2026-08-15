# Dash — Desk, post-deploy fixes: steps 1 and 2

**Date:** August 14, 2026
**Upload:** `js`, `docs`, `tests`, and **`sw.js` on its own** — bumped to `dash-v34`. No format change; a hard reload on the Mac is enough.

Following Fable's root-cause review, in its order. This is steps 1 and 2 only — the two it expected to change how the Desk feels day to day. Steps 3 and 4 are next, after you've used these. Step 5 gets its own session.

---

## 1. Dash was syncing with itself

This is the one behind "flicker with no obvious trigger", and it's the most valuable fix in the desk work so far.

Every time you edit anything, Dash writes an updated snapshot file to Dropbox a moment later. It also keeps a note of "the last snapshot I've already seen", so a poll can skip work when nothing has changed — but **only the reading side was updating that note**. The writing side never did.

So every 8–10 seconds, Dash downloaded the file it had just written itself, didn't recognise it, and did the full heavy reload: load the snapshot, rewind its own log, replay the whole thing, redraw the entire page. Every edit came back around as a ghost rebuild seconds later. No second device involved — it was talking to itself.

That random rebuild is also what was killing your drags: if it landed between grabbing a card and moving it, the card you were holding was destroyed and rebuilt underneath your cursor, which is exactly why drops snapped back and why a second attempt usually worked. Same for scrolling being ignored, and for new entries appearing in pieces.

The fix is to write down what we just wrote. Two lines, one on each sync backend.

## 2. The glance was quietly corrupting where you were

When you let go of the glance, the desk takes 380ms to grow back to full size. The code put your scroll position back *immediately* — while the desk was still tiny — so there was almost nothing to scroll and the browser clamped your position to roughly zero. Then the scroll listener dutifully wrote that zero down as "where she was".

From that moment on, **every** rebuild "restored" you to the top-left corner. That's why the reset showed up after a glance, and then again the next time you clicked Done — the glance broke it, and Done was just the next thing to reveal it.

Now: nothing that happens while you're holding the glance is recorded at all, and your position is handed back only once the desk has finished growing. If you have Reduce Motion on there's no animation to wait for, so it restores instantly — the code checks, rather than assuming.

---

## What I'd check

1. **Type into an entry and just watch for ten seconds.** The mystery flicker should be gone.
2. **Drag a few cards around.** The extra-click and snap-back should be much rarer — steps 3 and 4 close the rest.
3. **Scroll somewhere specific, hold `Z`, let go.** You should land exactly where you were.
4. **Then edit an entry and click Done.** You should still be where you were, not in the corner.

If 3 and 4 still misbehave, that's worth knowing immediately — it would mean something else is writing the scroll position too.

## Still to come

- **Step 3** — hold all redraws while a drag is in progress, not just the desk's own. Kills the remaining extra-click and snap-back cases at the root.
- **Step 4** — the double-click memory currently lives in something that gets destroyed on every rebuild, which is why expanding only reliably works on a card that's already on top.
- **Step 5** — update the desk in place instead of rebuilding it from scratch. The real answer to all of this, and deliberately its own session.

## The library question

Closed, per Fable, and I agree: every symptom traced to the environment rather than to the gesture code, and a library's event listeners die with a destroyed element exactly the way hand-written ones do. `panzoom` is out permanently — it wants to own the surface's transform, which is what the glance already uses. `interact.js` stays on the shelf until a D2+ feature actually needs inertia, snapping, resize handles or two-finger rotate.

---

New tests: that a snapshot survives a JSON round-trip unchanged (which is what makes the "already seen" marker work at all), and that a glance never overwrites the saved position — the second one fails against the old code, which is the only way to know a regression test is real.
