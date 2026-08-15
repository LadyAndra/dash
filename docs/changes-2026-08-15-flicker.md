# The typing flicker, and the editor closing on a drag

**August 15, 2026 · `dash-v36` → `dash-v37`**
Two bug fixes. No new features, no data format change, no new files in `SHELL`.

---

## 1. Typing in the editor flickered the whole screen

### What you saw

Open an entry from a project desk, start typing a title, and the whole screen
flashed once per character.

### What was actually happening

Two facts, each correct on its own, that added up to a flash.

The first: the editor saves on **every keystroke**. That is deliberate and it
stays. Dash is an op log, and a field that batches its writes is a field that
can lose them.

The second: every store write rebuilds the page from scratch. Also deliberate,
also stays for now.

So typing a title rebuilt the desk once per character. That alone would have
been invisible, because repainting the same pixels looks like nothing. The
problem was where the desk *started* each time.

A brand new scroll container starts at scroll position (0, 0), which on a
4400 × 2900 desk is the empty top-left corner of the sheet. The code that put
your real scroll position back ran inside `requestAnimationFrame` — and a rAF
callback fires on the **next** frame, not this one. So the browser painted one
full frame of the corner, and only then snapped back to where you actually
were.

That corner-flash, once per keystroke, was the flicker. Not a slow rebuild, not
a sync, not the editor. One frame of timing.

### The fix

The desk now hands out a `_deskMount()` hook. `views/project.js` calls it
**synchronously**, in the same task as the `appendChild` that puts the page on
screen.

That works for two reasons worth writing down, because they are the whole trick:

- Measuring and scrolling are valid at that moment *precisely because* the
  element is already in the document. This is why it could not simply be moved
  earlier inside `desk.js`; the desk builds itself while still detached, and a
  detached element has no size and cannot be scrolled.
- Nothing paints until the current task finishes. So the corner is never drawn,
  and there is nothing left to flash.

A `requestAnimationFrame` call stays behind the hook as a safety net for any
future caller that forgets it, with a `mounted` flag so the work happens exactly
once either way.

### What this means for "step 5"

The root-cause review had this bug down as step 5 of 5: *reconcile the desk in
place rather than rebuilding it*. That is a medium-sized refactor of
`js/views/desk.js`, and it was expected to be the only thing that could fix the
flicker.

It isn't, and it should no longer be filed as a bug fix.

**Reconciling is still the better end state.** It would take the per-keystroke
rebuild cost away entirely rather than hiding it, and it is the natural ground
for D2's clips and post-its. But it is now a *performance* change, wanted when
the desk gets busy enough to feel the rebuild, and it should be done on its own
with nothing else riding along.

---

## 2. The editor closed when you dragged to select text

### What you saw

Select a sentence in an entry's body by dragging across it, let go a little past
the edge of the box, and the editor closed on you.

### Why

Clicking the dark backdrop closes the editor, which is correct. The trouble is
what the browser calls a click.

A `click` event fires on the nearest common ancestor of where the pointer went
**down** and where it came **up**. Start a selection inside the modal and
release outside it, and that common ancestor is the backdrop. The handler had no
way to tell that apart from a real backdrop click, so it did as it was told.

### The fix

The backdrop now requires **both** ends of the gesture to be the backdrop
itself. It notes on `pointerdown` whether the press landed on itself, and only
closes if the click agrees.

A genuine backdrop click always satisfies both. A selection drag out of the
modal never does.

Two smaller scrims in `editor.js` (the inline project creator and the link
picker) still use the old single-ended check. They hold a name box and a search
box rather than long text, so it bites far less there, and they were left alone
to keep this upload to one change per bug. The same three lines fix them if it
ever becomes annoying.

---

## Files changed

```
js/views/desk.js      exposes _deskMount(); restore no longer waits a frame
js/views/project.js   calls the mount hook synchronously after appendChild
js/editor.js          the scrim needs both ends of the gesture
sw.js                 CACHE_VERSION → dash-v37 (no SHELL change: no new app files)
docs/dash-current-state.md
docs/changes-2026-08-15-flicker.md   (this file)
tests/desk-d1.mount.test.mjs         (new)
tests/editor-scrim.test.mjs          (new)
```

## Tests

```
tests/desk-d1.test.mjs            all 40 passed   (node, no install)
tests/desk-d1.render.test.mjs     all 28 passed
tests/desk-d1.gesture.test.mjs    all 16 passed
tests/desk-d1.viewstate.test.mjs  all 11 passed
tests/desk-d1.mount.test.mjs      all  8 passed   (new)
tests/editor-scrim.test.mjs       all  5 passed   (new)
```

**Both new files were checked against the un-fixed code and go red on it.** A
test for a bug that has never been seen to fail is not yet a test, and this is
the second time on the desk that a green suite has sat happily beside a real
bug.

The standing rule still holds and is worth restating, because this round leaned
on it: **jsdom has no layout.** It cannot see a flash. So the mount test does not
try to look at one — it asserts the thing that *caused* the flash, which is when
the restore runs. `requestAnimationFrame` in jsdom fires on a timer, so anything
that has already happened by the time `projectView.render()` returns happened
synchronously. That is the property the fix is made of, and it is testable
without a single pixel.
