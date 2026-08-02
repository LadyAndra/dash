# Change note — the mystery "Something went wrong inside Dash" banner

**Date:** August 1, 2026. **Cleanup #3 of the code-health review**
(`docs/review-2026-08-01-code-health.md`, §4.3). **Live at `dash-v28`.**

**Files changed:** `js/editor.js` only. No new files, so `SHELL` is untouched.
**Behaviour changed:** one bug removed, one small improvement to Escape. Nothing
else moves.

---

## The bug

Open any entry, close it with **Done** (or **Delete**, or by tapping the backdrop),
then press **Escape** at some point afterwards — and Dash showed the red
*"Something went wrong inside Dash"* banner, for no reason you could connect to
anything you'd just done.

Here's the chain. When the editor opened, it started listening for the Escape key.
It only ever *stopped* listening inside the Escape branch itself — so closing any
other way left the listener attached to the page permanently. Pressing Escape later
then ran the close routine a second time, on an editor that no longer existed, and
the line that removes the dialog from the page threw an error because the dialog
wasn't there any more. The global safety net caught it and showed the banner.

Two side effects, both invisible until now:

- **One orphaned listener piled up per editor you opened**, for as long as the tab
  stayed open. Open thirty entries in a session and one Escape press fired thirty
  close routines.
- Because the close routine also **saves the sketch**, a second run could re-save a
  drawing that had already been saved and closed.

This is why it felt random: the banner appeared on a keypress that had nothing to do
with the entry it was complaining about, sometimes long after.

## What changed

Three things, all in the closing logic:

1. **Closing is now safe to ask for twice.** A second request is a no-op instead of a
   half-run teardown.
2. **The listener is removed at the top of the close routine**, so *every* way out
   cleans up after itself — including any way added later.
3. **The dialog is removed with `scrim.remove()`** rather than the older phrasing that
   throws if the node has already gone. Belt and braces on top of (1).

### One small bonus fix

While in there: Escape now only closes the **topmost** dialog. Before, if you opened
an entry and then opened the "Link to…" picker on top of it, Escape closed the
*entry underneath* and left the picker floating on its own with nothing behind it.
Now the picker's own layer answers first, which is what you'd expect.

## How it was checked

The editor was run against a real browser DOM (jsdom) rather than reasoned about,
with nine tests:

- Escape still closes the editor — the behaviour that must not be lost
- Done closes it, and a later Escape throws nothing and doesn't re-close
- Backdrop close, then Escape — same
- **Twelve open/close cycles, then one Escape** — fires exactly nothing, proving the
  listeners no longer accumulate
- A nested picker stacks correctly, and Escape doesn't close the editor beneath it

All nine pass.

**And — more importantly — the same nine tests were re-run against the original
code**, because a test that passes both before and after a fix proves nothing. The
old version fails on the second test with exactly the predicted error:

```
NotFoundError: The node to be removed is not a child of this node.
```

So the tests really are catching the real bug, and the fix really does remove it.

---

## How to try it

1. Upload the **`js` folder**. (Plus `sw.js` if you haven't uploaded #1 or #2 —
   all three share `dash-v28`.)
2. **Hard-reload once** — Cmd+Shift+R.

Then:

- Open an entry, close it with **Done**, and press **Escape**. Nothing should happen —
  in particular, **no red banner**. That's the fix.
- Open an entry, press **Escape**. It should close, as before.
- Open an entry, click **＋ Link to…**, then press **Escape**. The picker should close
  and you should still be in the entry — not dumped back to the list.

---

## Noted, not changed

The other dialogs in Dash — Settings, the project creator, the "add existing entry"
picker, the milestone phase picker — have **no Escape handler at all**. So they can't
leak, but they also can't be dismissed with Escape, which is inconsistent with the
item editor and the bulk-action sheets (both of which can). Making Escape work
everywhere is a small, tidy change, but it *adds* behaviour rather than fixing
something broken, so it's left for you to decide on rather than slipped in here.
