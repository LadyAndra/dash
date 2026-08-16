# Dash — the ✧ button lets go when your hand drifts

**Date:** August 15, 2026
**Upload:** `js/views/desk.js`, `tests/desk-d1.gesture.test.mjs`, `docs`, and **`sw.js` on its own** — `dash-v40`. No CSS change, no format change.

---

## Your diagnosis was right, and I checked it before touching anything

You asked me to confirm rather than assume, so I built the real desk in a real browser (Chromium, real mouse input — actual hit-testing, not a simulation) and logged every pointer event the ✧ receives during a hold.

Holding still: only `pointerdown`. Holding while wobbling the cursor in small circles:

```
pointerdown(buttons=1) → pointerleave(buttons=1) → pointerleave(buttons=1)
```

`buttons=1` means **the mouse button was still down** when `pointerleave` fired. That's the confirmation — the browser was reporting "your cursor left the icon", the old code read it as "you let go", and the glance snapped back mid-hold. The measured box was 28 × 33px, exactly the `--control-min` figure you'd expect on a trackpad. Dragging well off the icon and releasing out there showed the same thing.

## What changed

Two lines of real change in `wireDesk`, both about what "let go" actually means.

**`pointerleave` is no longer a release signal.** It never answered the right question — it tells you where the cursor is, not whether the button is down. Release is now `pointerup`, `pointercancel` (the OS taking the gesture away mid-hold, which is the case `pointerleave` was probably standing in for), and `blur`.

**The button captures the pointer on the way down.** That routes the rest of the gesture to the ✧ wherever your cursor wanders, so the real `pointerup` still lands there even when you release far away from the icon. This is the same shape as the drag/pan code elsewhere in the file, which never depended on the cursor staying over one element either.

There's one bit of belt-and-braces: the window also listens for the release for the duration of a single hold, and pointer capture is feature-detected. A glance that never *ends* would be a worse bug than the one being fixed, so the release has two independent ways to arrive. Whichever lands first ends it; the second does nothing.

## What I did not touch

The transform maths, the ±2.3° rotation, the 380ms glance, and every other D1 constant are byte-for-byte unchanged. No CSS — the fix didn't need any, and the 28px control size stays as it is. The scroll contract from yesterday holds: **`tests/desk-d1.viewstate.test.mjs` passes unchanged, including the assertion that the whole gesture writes to the scroll position zero times.** The full desk suite is green (11 + 23 + 46 + 28 + 8 checks).

## What to try

Same five things you listed, all of which I ran in the browser first:

- **Click and hold the ✧ and wobble deliberately** — small circles, drift off the icon, keep holding. The desk should stay zoomed out the entire time.
- **Quick tap** — still flashes out and returns. That one's a real release, so it should still behave that way.
- **Drag off the icon, then let go out there** — the glance ends. Releasing is releasing, wherever your cursor happens to be.
- **Hold `Z`** — unchanged, as it always was.

If the ✧ ever gets *stuck* zoomed out after this, that's the new failure mode to tell me about and it would mean the release never arrived — but that's what the second listener is there to prevent.

## One optional file

`tests/desk-d1.gesture.test.mjs` picked up a section 5 covering this: that a `pointerleave` with the button still down does **not** end the glance, that a real `pointerup` does even when it happens off the icon, and that `pointercancel` and a quick tap both still work. Tests aren't deployed — nothing in `tests/` ships or sits in the service worker — so uploading it is optional and only matters for the next person running the suite.

---

Unchanged and still outstanding: the editor's click-and-drag-to-select closing the modal, which remains a separate pre-existing bug and wasn't touched here.
