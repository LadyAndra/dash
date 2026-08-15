# Dash — Desk post-deploy pass, steps 3 and 4

**Date:** August 14, 2026
**Upload:** `js`, `docs`, `tests`, and **`sw.js` on its own** — `dash-v36`. No format change.

---

## Step 3 — nothing redraws while you're holding the pointer

The desk already refused to write to the store between pressing down and letting go. But that only ever governed *the desk's own* writes. Anything else could still trigger a redraw mid-drag — a sync arriving, a status change, a keystroke in an open editor — and a redraw rebuilds the page from scratch, which destroys the very card your cursor is holding. The card stops moving, the drop lands on something that no longer exists, and the position is never saved.

So the rule got wider: while a pointer gesture is in progress, **nothing anywhere in the app redraws.** Anything that wanted to redraw waits, and runs once, the moment you let go.

The care is in the releasing. A hold that never gets released would freeze the whole app, so it's released on a normal drop, on the system taking the pointer away, on the window losing focus mid-drag, and on the desk being torn down. It's a count rather than an on/off switch, so two overlapping gestures can't release each other early.

This should close out the last of the extra-click and snap-back cases.

## Step 4 — double-click now works on any card

Expanding worked reliably only on a card that was already on top, which is an odd enough rule that it's worth explaining.

Clicking a card that *isn't* on top raises it — and raising is a save, and a save rebuilds the desk. The memory of "you clicked this card a moment ago" was being kept inside the thing that got rebuilt. So the second click arrived at a desk that had no idea you'd clicked once already, and counted it as a first click. Forever.

That memory now lives with the rest of the desk's state, where a rebuild can't reach it.

---

## What to check

1. **Drag cards around, especially while an entry is open in the editor.** No extra clicks, no snapping back.
2. **Double-click a card that's underneath another one** — it should expand first time.
3. **Drag a card, and while holding it, don't panic if nothing else on screen updates.** That's the point; it catches up when you let go.

If a drag ever leaves the app frozen — nothing updating at all, permanently — that's a leaked hold and I want to know immediately. The tests cover the four ways I could find for it to happen, but that's the failure mode worth naming out loud.

---

## Where this leaves things

Steps 1–4 of Fable's five are done. **Step 5** — updating the desk in place instead of rebuilding it — is the remaining structural one, and it's the fix for the typing flicker, which is unchanged and expected to be. It gets its own session, which was always the plan; the environment is now calm enough to attempt it safely.

Still on the list separately: the editor closing when you click-and-drag to select text.

95 checks across four test files, all passing.
